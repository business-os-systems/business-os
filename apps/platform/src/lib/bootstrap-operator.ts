import { randomUUID } from "node:crypto";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import {
  ConflictError,
  InternalServerError,
  ValidationError,
} from "@suite/core/errors";
import {
  PLATFORM_AUDIT_ACTIONS,
  type appendPlatformAuditEvent,
  type storeBootstrapToken,
} from "@suite/auth/platform";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BootstrapOperatorDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly createToken: () => string;
  readonly storeToken: typeof storeBootstrapToken;
  readonly appendAudit: typeof appendPlatformAuditEvent;
}

export interface BootstrapOperatorInput {
  readonly email: string;
  readonly displayName: string;
}

export interface BootstrapOperatorResult {
  readonly operatorId: string;
  readonly email: string;
  readonly displayName: string;
  readonly token: string;
  readonly action: string;
}

async function findOperatorZero(
  prisma: PrismaClient,
  email: string
): Promise<{ id: string; email: string; displayName: string; action: string } | null> {
  const existing = await prisma.platformOperator.findMany({ take: 2 });
  if (existing.length > 1) {
    throw new ConflictError(
      "An operator already exists; bootstrap is only for operator zero"
    );
  }
  if (existing.length === 0) {
    return null;
  }
  const only = existing[0];
  if (!only) {
    throw new InternalServerError("Operator lookup returned no record");
  }
  const passkeys = await prisma.operatorPasskey.count({
    where: { operatorId: only.id },
  });
  if (
    only.status !== "INVITED" ||
    only.mfaEnrolled ||
    passkeys > 0 ||
    only.email !== email
  ) {
    throw new ConflictError(
      "An operator already exists; bootstrap is only for operator zero"
    );
  }
  return {
    id: only.id,
    email: only.email,
    displayName: only.displayName,
    action: PLATFORM_AUDIT_ACTIONS.BOOTSTRAP_REISSUED,
  };
}

async function createOperatorZero(
  deps: BootstrapOperatorDependencies,
  input: BootstrapOperatorInput,
  requestId: string
): Promise<{ id: string; email: string; displayName: string; action: string }> {
  const created = await deps.prisma.$transaction(async (tx) => {
    const operator = await tx.platformOperator.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        status: "INVITED",
        mfaEnrolled: false,
      },
    });
    await tx.operatorCapability.createMany({
      data: Object.values(PLATFORM_CAPABILITIES).map((capability) => ({
        operatorId: operator.id,
        capability: capability.code,
      })),
    });
    await deps.appendAudit(tx, {
      actorOperatorId: null,
      action: PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED,
      entityType: "PlatformOperator",
      entityId: operator.id,
      requestId,
    });
    return operator;
  });
  return {
    id: created.id,
    email: created.email,
    displayName: created.displayName,
    action: PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED,
  };
}

/**
 * Creates operator zero, or reissues its one-time link while it is still
 * INVITED with no passkey. The bootstrap token is stored hashed and audited.
 */
export async function bootstrapFirstOperator(
  deps: BootstrapOperatorDependencies,
  input: BootstrapOperatorInput
): Promise<BootstrapOperatorResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError(
      "PLATFORM_BOOTSTRAP_OPERATOR_EMAIL is not a valid email address"
    );
  }

  const requestId = `bootstrap:${randomUUID()}`;
  const operator =
    (await findOperatorZero(deps.prisma, email)) ??
    (await createOperatorZero(
      deps,
      { email, displayName: input.displayName },
      requestId
    ));

  const token = deps.createToken();
  try {
    await deps.storeToken({
      redis: deps.redis,
      token,
      payload: { operatorId: operator.id, email: operator.email },
    });
  } catch (error) {
    if (operator.action === PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED) {
      await deps.prisma.platformOperator.delete({ where: { id: operator.id } });
    }
    throw error;
  }

  if (operator.action === PLATFORM_AUDIT_ACTIONS.BOOTSTRAP_REISSUED) {
    await deps.appendAudit(deps.prisma, {
      actorOperatorId: null,
      action: operator.action,
      entityType: "PlatformOperator",
      entityId: operator.id,
      requestId,
    });
  }

  return {
    operatorId: operator.id,
    email: operator.email,
    displayName: operator.displayName,
    token,
    action: operator.action,
  };
}
