import type { PlatformOperator, PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ConflictError, UnauthorizedError } from "@suite/core/errors";
import {
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_ENROLMENT_REVOCATION_REASONS,
  appendPlatformAuditEvent,
  consumeEnrolmentToken,
  createEnrolmentToken,
  ENROLMENT_TOKEN_TTL_SECONDS,
  hashEnrolmentToken,
  readEnrolmentToken,
  storeEnrolmentToken,
} from "@suite/auth/platform";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { isUniqueConstraintViolation } from "./prisma-errors.js";
import {
  finishRegistration,
  startRegistration,
  type VerifiedRegistration,
  type WebAuthnConfig,
} from "./platform-webauthn.service.js";
import {
  OPERATOR_STATUS,
  type EnrolledOperator,
} from "./operator.contract.js";

const OPERATOR_ENTITY_TYPE = "PlatformOperator";
const PASSKEY_NAME_ADDITIONAL = "Additional passkey";

export interface OperatorSelfEnrolmentServiceDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly config: WebAuthnConfig;
  /** Test seam; the factory defaults it to the shared WebAuthn verifier. */
  readonly verifyRegistration?: typeof finishRegistration;
}

interface OperatorSelfEnrolmentRuntime {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly config: WebAuthnConfig;
  readonly verifyRegistration: typeof finishRegistration;
}

export interface IssueSelfEnrolmentTokenInput {
  readonly operatorId: string;
  readonly requestId: string;
}

export interface IssuedEnrolmentToken {
  readonly token: string;
  readonly expiresAt: string;
}

export interface StartSelfEnrolmentInput {
  readonly token: string;
  readonly requestId: string;
}

export interface FinishSelfEnrolmentInput {
  readonly token: string;
  readonly flowId: string;
  readonly response: RegistrationResponseJSON;
  readonly requestId: string;
}

export interface StartedSelfEnrolment {
  readonly flowId: string;
  readonly options: Awaited<ReturnType<typeof startRegistration>>["options"];
  readonly email: string;
}

function enrolmentInvalid(cause?: unknown): UnauthorizedError {
  return new UnauthorizedError(
    "The passkey enrolment token is invalid or expired.",
    {
      code: PLATFORM_ERROR_CODE.OPERATOR_ENROLMENT_INVALID,
      ...(cause === undefined ? {} : { cause }),
    }
  );
}

async function findActiveOperator(
  prisma: PrismaClient,
  operatorId: string
): Promise<PlatformOperator | null> {
  const operator = await prisma.platformOperator.findUnique({
    where: { id: operatorId },
  });
  if (operator?.status !== OPERATOR_STATUS.ACTIVE) {
    return null;
  }
  return operator;
}

interface AuditInput {
  readonly actorOperatorId: string;
  readonly action: string;
  readonly requestId: string;
  readonly reason?: string;
  readonly after?: Record<string, string>;
}

async function audit(
  prisma: Pick<PrismaClient, "auditEvent">,
  input: AuditInput
): Promise<void> {
  await appendPlatformAuditEvent(prisma, {
    actorOperatorId: input.actorOperatorId,
    action: input.action,
    entityType: OPERATOR_ENTITY_TYPE,
    entityId: input.actorOperatorId,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.after === undefined ? {} : { after: input.after }),
    requestId: input.requestId,
  });
}

interface FailureInput {
  readonly prisma: PrismaClient;
  readonly actorOperatorId: string;
  readonly requestId: string;
  readonly reason: string;
  readonly after?: Record<string, string>;
}

async function auditEnrolmentFailure(input: FailureInput): Promise<void> {
  await input.prisma.$transaction(async (tx) => {
    await audit(tx, {
      actorOperatorId: input.actorOperatorId,
      action: PLATFORM_AUDIT_ACTIONS.ENROLMENT_FAILED,
      requestId: input.requestId,
      reason: input.reason,
      ...(input.after === undefined ? {} : { after: input.after }),
    });
    await audit(tx, {
      actorOperatorId: input.actorOperatorId,
      action: PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_REVOKED,
      requestId: input.requestId,
      reason: input.reason,
      ...(input.after === undefined ? {} : { after: input.after }),
    });
  });
}

interface RevokeFailureInput {
  readonly token: string;
  readonly requestId: string;
  readonly reason: string;
  readonly fallbackOperatorId?: string;
  readonly after?: Record<string, string>;
}

/**
 * Failure path: consuming the token is the revocation, and the two audit rows
 * are written together so a revoked token always has an outcome on record.
 */
async function revokeFailedEnrolment(
  deps: OperatorSelfEnrolmentRuntime,
  input: RevokeFailureInput
): Promise<void> {
  const payload = await consumeEnrolmentToken(deps.redis, input.token);
  const actorOperatorId =
    payload?.operatorId ?? input.fallbackOperatorId;
  if (actorOperatorId === undefined) {
    return;
  }
  await auditEnrolmentFailure({
    prisma: deps.prisma,
    actorOperatorId,
    requestId: input.requestId,
    reason: input.reason,
    ...(input.after === undefined ? {} : { after: input.after }),
  });
}

async function issueEnrolmentToken(
  deps: OperatorSelfEnrolmentRuntime,
  input: IssueSelfEnrolmentTokenInput
): Promise<IssuedEnrolmentToken> {
  const operator = await findActiveOperator(deps.prisma, input.operatorId);
  if (operator === null) {
    throw enrolmentInvalid();
  }
  const token = createEnrolmentToken();
  const expiresAt = new Date(
    Date.now() + ENROLMENT_TOKEN_TTL_SECONDS * 1000
  );
  await storeEnrolmentToken({
    redis: deps.redis,
    token,
    payload: { operatorId: operator.id },
  });
  await audit(deps.prisma, {
    actorOperatorId: operator.id,
    action: PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_ISSUED,
    requestId: input.requestId,
    after: { expiresAt: expiresAt.toISOString() },
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

async function startSelfEnrolment(
  deps: OperatorSelfEnrolmentRuntime,
  input: StartSelfEnrolmentInput
): Promise<StartedSelfEnrolment> {
  const payload = await readEnrolmentToken(deps.redis, input.token);
  if (payload === null) {
    throw enrolmentInvalid();
  }
  const operator = await findActiveOperator(deps.prisma, payload.operatorId);
  if (operator === null) {
    await revokeFailedEnrolment(deps, {
      token: input.token,
      requestId: input.requestId,
      reason: PLATFORM_ENROLMENT_REVOCATION_REASONS.OPERATOR_INACTIVE,
    });
    throw enrolmentInvalid();
  }
  const tokenHash = await hashEnrolmentToken(input.token);
  const registration = await startRegistration({
    redis: deps.redis,
    config: deps.config,
    operator,
    tokenHash,
  });
  return { ...registration, email: operator.email };
}

async function verifyRegistration(
  deps: OperatorSelfEnrolmentRuntime,
  input: FinishSelfEnrolmentInput
): Promise<VerifiedRegistration> {
  try {
    return await deps.verifyRegistration({
      redis: deps.redis,
      config: deps.config,
      flowId: input.flowId,
      response: input.response,
    });
  } catch (error) {
    await revokeFailedEnrolment(deps, {
      token: input.token,
      requestId: input.requestId,
      reason: PLATFORM_ENROLMENT_REVOCATION_REASONS.VERIFICATION_FAILED,
    });
    throw enrolmentInvalid(error);
  }
}

interface CompletedEnrolmentInput {
  readonly deps: OperatorSelfEnrolmentRuntime;
  readonly input: FinishSelfEnrolmentInput;
  readonly verified: VerifiedRegistration;
}

function alreadyRegistered(): ConflictError {
  return new ConflictError("This passkey is already registered.", {
    code: PLATFORM_ERROR_CODE.OPERATOR_PASSKEY_ALREADY_REGISTERED,
  });
}

async function assertCredentialAvailable(
  prisma: PrismaClient,
  credentialId: string
): Promise<void> {
  const existing = await prisma.operatorPasskey.findUnique({
    where: { credentialId },
    select: { id: true },
  });
  if (existing !== null) {
    throw alreadyRegistered();
  }
}

interface PersistPasskeyInput {
  readonly deps: OperatorSelfEnrolmentRuntime;
  readonly operator: PlatformOperator;
  readonly input: FinishSelfEnrolmentInput;
  readonly verified: VerifiedRegistration;
}

async function persistPasskey(input: PersistPasskeyInput): Promise<void> {
  const { deps, operator, verified } = input;
  await deps.prisma.$transaction(async (tx) => {
    await tx.operatorPasskey.create({
      data: {
        operatorId: operator.id,
        credentialId: verified.credential.id,
        publicKey: verified.credential.publicKey,
        counter: verified.credential.counter,
        deviceType: verified.credential.deviceType,
        backedUp: verified.credential.backedUp,
        transports: verified.credential.transports.join(","),
        name: PASSKEY_NAME_ADDITIONAL,
        rpId: deps.config.rpID,
      },
    });
    await tx.platformOperator.update({
      where: { id: operator.id },
      data: { mfaEnrolled: true },
    });
    await audit(tx, {
      actorOperatorId: operator.id,
      action: PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED,
      requestId: input.input.requestId,
      after: { rpID: deps.config.rpID },
    });
    await audit(tx, {
      actorOperatorId: operator.id,
      action: PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_REVOKED,
      requestId: input.input.requestId,
      reason: PLATFORM_ENROLMENT_REVOCATION_REASONS.COMPLETED,
      after: { rpID: deps.config.rpID },
    });
  });
}

async function failEnrolment(
  deps: OperatorSelfEnrolmentRuntime,
  actorOperatorId: string,
  requestId: string,
  reason: string
): Promise<never> {
  await auditEnrolmentFailure({
    prisma: deps.prisma,
    actorOperatorId,
    requestId,
    reason,
  });
  throw enrolmentInvalid();
}

async function consumeForOperator(
  deps: OperatorSelfEnrolmentRuntime,
  input: FinishSelfEnrolmentInput,
  verified: VerifiedRegistration
): Promise<string> {
  const payload = await consumeEnrolmentToken(deps.redis, input.token);
  if (payload === null) {
    return failEnrolment(
      deps,
      verified.operatorId,
      input.requestId,
      PLATFORM_ENROLMENT_REVOCATION_REASONS.TOKEN_REUSED
    );
  }
  if (payload.operatorId !== verified.operatorId) {
    return failEnrolment(
      deps,
      payload.operatorId,
      input.requestId,
      PLATFORM_ENROLMENT_REVOCATION_REASONS.OPERATOR_MISMATCH
    );
  }
  return payload.operatorId;
}

async function persistWithConflictAudit(
  input: PersistPasskeyInput
): Promise<void> {
  const { deps, operator, verified } = input;
  try {
    await assertCredentialAvailable(deps.prisma, verified.credential.id);
    await persistPasskey(input);
  } catch (error) {
    if (
      error instanceof ConflictError ||
      isUniqueConstraintViolation(error, "credentialId")
    ) {
      return failEnrolment(
        deps,
        operator.id,
        input.input.requestId,
        PLATFORM_ENROLMENT_REVOCATION_REASONS.PASSKEY_ALREADY_REGISTERED
      );
    }
    throw error;
  }
}

async function completeEnrolment(
  options: CompletedEnrolmentInput
): Promise<EnrolledOperator> {
  const { deps, input, verified } = options;
  const operatorId = await consumeForOperator(deps, input, verified);
  const operator = await findActiveOperator(deps.prisma, operatorId);
  if (operator === null) {
    return failEnrolment(
      deps,
      operatorId,
      input.requestId,
      PLATFORM_ENROLMENT_REVOCATION_REASONS.OPERATOR_INACTIVE
    );
  }
  await persistWithConflictAudit({ deps, operator, input, verified });
  return {
    id: operator.id,
    email: operator.email,
    status: OPERATOR_STATUS.ACTIVE,
    mfaEnrolled: true,
  };
}

async function finishSelfEnrolment(
  deps: OperatorSelfEnrolmentRuntime,
  input: FinishSelfEnrolmentInput
): Promise<EnrolledOperator> {
  const verified = await verifyRegistration(deps, input);
  const tokenHash = await hashEnrolmentToken(input.token);
  if (verified.tokenHash !== tokenHash) {
    await revokeFailedEnrolment(deps, {
      token: input.token,
      requestId: input.requestId,
      reason: PLATFORM_ENROLMENT_REVOCATION_REASONS.VERIFICATION_FAILED,
      fallbackOperatorId: verified.operatorId,
    });
    throw enrolmentInvalid();
  }
  return completeEnrolment({ deps, input, verified });
}

export function createOperatorSelfEnrolmentService(
  dependencies: OperatorSelfEnrolmentServiceDependencies
) {
  const runtime: OperatorSelfEnrolmentRuntime = {
    ...dependencies,
    verifyRegistration:
      dependencies.verifyRegistration ?? finishRegistration,
  };
  return {
    issue: (input: IssueSelfEnrolmentTokenInput) =>
      issueEnrolmentToken(runtime, input),
    start: (input: StartSelfEnrolmentInput) =>
      startSelfEnrolment(runtime, input),
    finish: (input: FinishSelfEnrolmentInput) =>
      finishSelfEnrolment(runtime, input),
  };
}
