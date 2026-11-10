import {
  Prisma,
  type PlatformOperator,
  type PlatformOperatorStatus,
  type PrismaClient,
} from "@suite/db";
import type { Redis } from "@suite/redis";
import { logger, scrubStringValues } from "@suite/logger";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  isPlatformCapability,
  type PlatformCapability,
} from "@suite/core";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@suite/core/errors";
import {
  PLATFORM_AUDIT_ACTIONS,
  appendPlatformAuditEvent,
  createOperatorInvitationToken,
  hashOperatorInvitationToken,
  invalidatePlatformCapabilities,
} from "@suite/auth/platform";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { decodeIdCursor, pageSlice } from "../../lib/id-cursor.js";
import { isUniqueConstraintViolation } from "./prisma-errors.js";
import {
  assertAnotherOperatorManager,
  lockOperatorGovernance,
} from "./operator-guard.js";
import {
  finishRegistration,
  startRegistration,
  type VerifiedRegistration,
  type WebAuthnConfig,
} from "./platform-webauthn.service.js";
import {
  OPERATOR_STATUS,
  DEFAULT_INVITATION_TTL_HOURS,
  MAX_INVITATION_TTL_HOURS,
  MAX_OPERATOR_PAGE_SIZE,
  MIN_INVITATION_TTL_HOURS,
  type ChangeOperatorCapabilitiesInput,
  type CreateOperatorInput,
  type CreatedOperator,
  type OperatorActor,
  type OperatorGovernanceStatus,
  type OperatorPage,
  type OperatorSummary,
  type UpdateOperatorStatusInput,
} from "./operator.contract.js";

const OPERATOR_ENTITY_TYPE = "PlatformOperator";
const OPERATOR_INVITATION_ENTITY_TYPE = "PlatformOperatorInvitation";
const OPERATOR_EMAIL_CONFLICT_DETAIL =
  "An operator with this email address already exists.";
const MILLISECONDS_PER_HOUR = 3_600_000;

const STATUS_TRANSITIONS: Record<
  PlatformOperatorStatus,
  readonly OperatorGovernanceStatus[]
> = {
  [OPERATOR_STATUS.INVITED]: [OPERATOR_STATUS.REVOKED],
  [OPERATOR_STATUS.ACTIVE]: [
    OPERATOR_STATUS.SUSPENDED,
    OPERATOR_STATUS.REVOKED,
  ],
  [OPERATOR_STATUS.SUSPENDED]: [
    OPERATOR_STATUS.ACTIVE,
    OPERATOR_STATUS.REVOKED,
  ],
  [OPERATOR_STATUS.REVOKED]: [],
};

interface OperatorRows {
  readonly capabilities: readonly {
    readonly capability: string;
    readonly revokedAt: Date | null;
  }[];
}

function activeCapabilities(rows: OperatorRows): PlatformCapability[] {
  const active: PlatformCapability[] = [];
  for (const row of rows.capabilities) {
    if (row.revokedAt === null && isPlatformCapability(row.capability)) {
      active.push(row.capability);
    }
  }
  return active;
}

function toSummary(
  operator: PlatformOperator,
  capabilities: readonly PlatformCapability[]
): OperatorSummary {
  return {
    id: operator.id,
    email: operator.email,
    displayName: operator.displayName,
    status: operator.status,
    mfaEnrolled: operator.mfaEnrolled,
    lastSeenAt: operator.lastSeenAt?.toISOString() ?? null,
    capabilities: [...capabilities],
  };
}

function validateCapabilities(
  capabilities: readonly string[]
): PlatformCapability[] {
  const valid: PlatformCapability[] = [];
  const unknown: string[] = [];
  for (const code of capabilities) {
    if (isPlatformCapability(code)) {
      valid.push(code);
    } else {
      unknown.push(code);
    }
  }
  if (unknown.length > 0) {
    throw new ValidationError(
      "Unknown platform capability.",
      unknown.map((code) => ({
        name: "capabilities",
        reason: `${code} is not in the platform capability registry`,
      })),
      { code: PLATFORM_ERROR_CODE.UNKNOWN_CAPABILITY }
    );
  }
  return [...new Set(valid)];
}

function isEmailUniqueViolation(error: unknown): boolean {
  return isUniqueConstraintViolation(error, "email");
}

function validateInvitationTtl(hours: number): number {
  if (
    !Number.isInteger(hours) ||
    hours < MIN_INVITATION_TTL_HOURS ||
    hours > MAX_INVITATION_TTL_HOURS
  ) {
    throw new ValidationError(
      `The invitation lifetime must be between ${MIN_INVITATION_TTL_HOURS} and ${MAX_INVITATION_TTL_HOURS} hours.`,
      undefined,
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
  return hours;
}

async function listOperators(
  prisma: PrismaClient,
  input: { readonly cursor?: string; readonly limit: number }
): Promise<OperatorPage> {
  const limit = Math.min(Math.max(input.limit, 1), MAX_OPERATOR_PAGE_SIZE);
  const cursor =
    input.cursor === undefined
      ? undefined
      : decodeIdCursor(input.cursor);
  const rows = await prisma.platformOperator.findMany({
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    include: {
      capabilities: {
        where: { revokedAt: null },
        select: { capability: true, revokedAt: true },
      },
    },
  });
  const page = pageSlice(rows, limit, (row) => row.id);
  return {
    items: page.items.map((row) =>
      toSummary(row, activeCapabilities(row))
    ),
    nextCursor: page.nextCursor,
  };
}

interface PersistInvitationInput {
  readonly tx: Prisma.TransactionClient;
  readonly email: string;
  readonly displayName: string;
  readonly capabilities: readonly PlatformCapability[];
  readonly actor: OperatorActor;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

async function grantInvitedCapabilities(
  tx: Prisma.TransactionClient,
  operatorId: string,
  capabilities: readonly PlatformCapability[],
  actor: OperatorActor
): Promise<void> {
  if (capabilities.length === 0) {
    return;
  }
  await tx.operatorCapability.createMany({
    data: capabilities.map((capability) => ({
      operatorId,
      capability,
      grantedBy: actor.operatorId,
    })),
  });
}

async function reissueInvitation(
  tx: Prisma.TransactionClient,
  existing: { readonly id: string },
  input: PersistInvitationInput
): Promise<{ operator: PlatformOperator; invitationExpiresAt: Date }> {
  const { email, capabilities, actor, tokenHash, expiresAt } = input;
  const live = await tx.operatorInvitation.findFirst({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (live !== null) {
    throw new ConflictError(OPERATOR_EMAIL_CONFLICT_DETAIL, {
      code: PLATFORM_ERROR_CODE.OPERATOR_ALREADY_INVITED,
    });
  }
  const now = new Date();
  await tx.operatorInvitation.updateMany({
    where: { email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.operatorCapability.updateMany({
    where: { operatorId: existing.id, revokedAt: null },
    data: { revokedAt: now },
  });
  const operator = await tx.platformOperator.update({
    where: { id: existing.id },
    data: { displayName: input.displayName.trim() },
  });
  await grantInvitedCapabilities(tx, operator.id, capabilities, actor);
  const invitation = await tx.operatorInvitation.create({
    data: { email, tokenHash, invitedBy: actor.operatorId, expiresAt },
  });
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: actor.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.INVITED,
    entityType: OPERATOR_ENTITY_TYPE,
    entityId: operator.id,
    after: {
      email,
      displayName: operator.displayName,
      capabilities,
      invitationId: invitation.id,
      invitationExpiresAt: expiresAt.toISOString(),
      reissued: true,
    },
    requestId: actor.requestId,
  });
  return { operator, invitationExpiresAt: invitation.expiresAt };
}

async function persistInvitation(
  input: PersistInvitationInput
): Promise<{ operator: PlatformOperator; invitationExpiresAt: Date }> {
  const { tx, email, capabilities, actor, tokenHash, expiresAt } = input;
  const existing = await tx.platformOperator.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (existing !== null) {
    if (existing.status === OPERATOR_STATUS.INVITED) {
      return reissueInvitation(tx, existing, input);
    }
    throw operatorEmailConflict(existing.status);
  }
  const operator = await tx.platformOperator.create({
    data: {
      email,
      displayName: input.displayName.trim(),
      status: OPERATOR_STATUS.INVITED,
      invitedBy: actor.operatorId,
    },
  });
  await grantInvitedCapabilities(tx, operator.id, capabilities, actor);
  const invitation = await tx.operatorInvitation.create({
    data: { email, tokenHash, invitedBy: actor.operatorId, expiresAt },
  });
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: actor.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.INVITED,
    entityType: OPERATOR_ENTITY_TYPE,
    entityId: operator.id,
    after: {
      email,
      displayName: operator.displayName,
      capabilities,
      invitationId: invitation.id,
      invitationExpiresAt: expiresAt.toISOString(),
    },
    requestId: actor.requestId,
  });
  return { operator, invitationExpiresAt: invitation.expiresAt };
}

interface CreateOperatorContext {
  readonly prisma: PrismaClient;
  readonly input: CreateOperatorInput;
  readonly actor: OperatorActor;
}

async function createOperator(
  context: CreateOperatorContext
): Promise<CreatedOperator> {
  const { prisma, input, actor } = context;
  const capabilities = validateCapabilities(input.capabilities);
  const ttlHours = validateInvitationTtl(
    input.invitationTtlHours ?? DEFAULT_INVITATION_TTL_HOURS
  );
  const email = input.email.trim().toLowerCase();
  const expiresAt = new Date(
    Date.now() + ttlHours * MILLISECONDS_PER_HOUR
  );
  const invitationToken = createOperatorInvitationToken();
  const tokenHash = await hashOperatorInvitationToken(invitationToken);

  try {
    const created = await prisma.$transaction((tx) =>
      persistInvitation({
        tx,
        email,
        displayName: input.displayName,
        capabilities,
        actor,
        tokenHash,
        expiresAt,
      })
    );
    return {
      operator: toSummary(created.operator, capabilities),
      admissionPending: true,
      invitationExpiresAt: created.invitationExpiresAt.toISOString(),
      invitationToken,
    };
  } catch (error) {
    if (isEmailUniqueViolation(error)) {
      const existing = await prisma.platformOperator.findUnique({
        where: { email },
        select: { status: true },
      });
      const conflict = operatorEmailConflict(
        existing?.status ?? OPERATOR_STATUS.ACTIVE
      );
      throw new ConflictError(conflict.detail, {
        code: conflict.code,
        cause: error,
      });
    }
    throw error;
  }
}

interface OperatorWithCapabilities extends PlatformOperator, OperatorRows {}

function operatorNotFound(): NotFoundError {
  return new NotFoundError("Operator not found.", {
    code: PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND,
  });
}

function operatorEmailConflict(
  status: PlatformOperatorStatus
): ConflictError {
  return new ConflictError(OPERATOR_EMAIL_CONFLICT_DETAIL, {
    code:
      status === OPERATOR_STATUS.INVITED
        ? PLATFORM_ERROR_CODE.OPERATOR_ALREADY_INVITED
        : PLATFORM_ERROR_CODE.OPERATOR_ALREADY_EXISTS,
  });
}

function assertStatusTransition(
  from: PlatformOperatorStatus,
  to: OperatorGovernanceStatus
): void {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(
      `Cannot change an operator from ${from} to ${to}.`,
      undefined,
      { code: PLATFORM_ERROR_CODE.INVALID_TRANSITION }
    );
  }
}

async function invalidateOperatorCache(
  redis: Redis,
  operatorId: string
): Promise<void> {
  try {
    await invalidatePlatformCapabilities({ redis, operatorId });
  } catch (error) {
    // The 60-second cache expiry is the backstop (FR-007); a cache outage must
    // not turn a committed governance mutation into a client-visible failure.
    logger.warn(
      {
        operatorId,
        error: scrubStringValues(
          error instanceof Error ? error.message : String(error)
        ),
      },
      "Platform capability cache invalidation failed"
    );
  }
}

async function updateOperatorStatus(
  context: UpdateOperatorStatusInput & {
    readonly prisma: PrismaClient;
    readonly redis: Redis;
  }
): Promise<OperatorSummary> {
  const { prisma, redis, ...input } = context;
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await lockOperatorGovernance(tx);
    const target = await tx.platformOperator.findUnique({
      where: { id: input.operatorId },
      include: { capabilities: { where: { revokedAt: null } } },
    });
    if (target === null) {
      throw operatorNotFound();
    }
    if (target.status !== input.expectedStatus) {
      throw new ConflictError(
        "The operator status changed since it was loaded. Reload and retry.",
        { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
      );
    }
    assertStatusTransition(target.status, input.status);
    if (input.status !== OPERATOR_STATUS.ACTIVE) {
      await assertAnotherOperatorManager(tx, target);
      await tx.operatorSession.updateMany({
        where: { operatorId: target.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.operatorInvitation.updateMany({
        where: {
          email: target.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }
    const operator = await tx.platformOperator.update({
      where: { id: target.id },
      data: { status: input.status },
    });
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.actor.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.STATUS_CHANGED,
      entityType: OPERATOR_ENTITY_TYPE,
      entityId: operator.id,
      before: { status: target.status },
      after: { status: operator.status },
      reason: input.reason,
      requestId: input.actor.requestId,
    });
    return { operator, capabilities: activeCapabilities(target) };
  });
  await invalidateOperatorCache(redis, input.operatorId);
  return toSummary(updated.operator, updated.capabilities);
}

interface CapabilityChange {
  readonly grant: PlatformCapability[];
  readonly revoke: PlatformCapability[];
}

function assertCapabilityChange(
  grantInput: readonly string[],
  revokeInput: readonly string[]
): CapabilityChange {
  const grant = validateCapabilities(grantInput);
  const revoke = validateCapabilities(revokeInput);
  if (grant.length === 0 && revoke.length === 0) {
    throw new ValidationError(
      "Provide at least one capability to grant or revoke.",
      undefined,
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
  const overlap = grant.filter((capability) => revoke.includes(capability));
  if (overlap.length > 0) {
    throw new ValidationError(
      "A capability cannot be granted and revoked in the same request.",
      overlap.map((capability) => ({
        name: "capabilities",
        reason: `${capability} appears in both grant and revoke`,
      })),
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
  return { grant, revoke };
}

async function applyCapabilityChanges(
  tx: Prisma.TransactionClient,
  target: OperatorWithCapabilities,
  change: CapabilityChange,
  actor: OperatorActor
): Promise<PlatformCapability[]> {
  const now = new Date();
  const current = new Set(activeCapabilities(target));
  const newGrants = change.grant.filter(
    (capability) => !current.has(capability)
  );
  if (newGrants.length > 0) {
    await tx.operatorCapability.createMany({
      data: newGrants.map((capability) => ({
        operatorId: target.id,
        capability,
        grantedBy: actor.operatorId,
      })),
    });
  }
  if (change.revoke.length > 0) {
    await tx.operatorCapability.updateMany({
      where: {
        operatorId: target.id,
        capability: { in: change.revoke },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  }
  const rows = await tx.operatorCapability.findMany({
    where: { operatorId: target.id, revokedAt: null },
    select: { capability: true, revokedAt: true },
  });
  const after = activeCapabilities({ capabilities: rows });
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: actor.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
    entityType: OPERATOR_ENTITY_TYPE,
    entityId: target.id,
    before: { capabilities: activeCapabilities(target) },
    after: { capabilities: after },
    requestId: actor.requestId,
  });
  // FR-059: a privilege change revokes the target's live sessions, so the old
  // cookie cannot keep the previous capability set.
  await tx.operatorSession.updateMany({
    where: { operatorId: target.id, revokedAt: null },
    data: { revokedAt: now },
  });
  return after;
}

async function changeOperatorCapabilities(
  context: ChangeOperatorCapabilitiesInput & {
    readonly prisma: PrismaClient;
    readonly redis: Redis;
  }
): Promise<readonly PlatformCapability[]> {
  const { prisma, redis, ...input } = context;
  const change = assertCapabilityChange(input.grant, input.revoke);
  const capabilities = await prisma.$transaction(async (tx) => {
    await lockOperatorGovernance(tx);
    const target = await tx.platformOperator.findUnique({
      where: { id: input.operatorId },
      include: { capabilities: { where: { revokedAt: null } } },
    });
    if (target === null) {
      throw operatorNotFound();
    }
    if (change.revoke.includes(PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code)) {
      await assertAnotherOperatorManager(tx, target);
    }
    return applyCapabilityChanges(tx, target, change, input.actor);
  });
  await invalidateOperatorCache(redis, input.operatorId);
  return capabilities;
}

interface OperatorEnrolmentDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly config: WebAuthnConfig;
  readonly verifyRegistration: typeof finishRegistration;
}

export interface OperatorEnrolmentServiceDependencies
  extends Omit<OperatorEnrolmentDependencies, "verifyRegistration"> {
  /** Test seam; the factory defaults it to the shared WebAuthn verifier. */
  readonly verifyRegistration?: typeof finishRegistration;
}

function invitationInvalid(cause?: unknown): UnauthorizedError {
  return new UnauthorizedError(
    "The operator invitation is invalid or expired.",
    {
      code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
      ...(cause === undefined ? {} : { cause }),
    }
  );
}

async function findEnrolmentInvitation(
  prisma: PrismaClient,
  tokenHash: string,
  now: Date
): Promise<{ readonly id: string; readonly email: string } | null> {
  return prisma.operatorInvitation.findFirst({
    where: {
      tokenHash,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, email: true },
  });
}

async function startOperatorEnrolment(
  dependencies: OperatorEnrolmentDependencies,
  token: string
): Promise<{
  flowId: string;
  options: Awaited<ReturnType<typeof startRegistration>>["options"];
  email: string;
}> {
  const tokenHash = await hashOperatorInvitationToken(token);
  const invitation = await findEnrolmentInvitation(
    dependencies.prisma,
    tokenHash,
    new Date()
  );
  if (invitation === null) {
    throw invitationInvalid();
  }
  const operator = await dependencies.prisma.platformOperator.findUnique({
    where: { email: invitation.email },
  });
  if (operator?.status !== OPERATOR_STATUS.INVITED || operator.mfaEnrolled) {
    throw invitationInvalid();
  }
  const registration = await startRegistration({
    redis: dependencies.redis,
    config: dependencies.config,
    operator,
    tokenHash,
  });
  return { ...registration, email: operator.email };
}

export interface FinishOperatorEnrolmentInput {
  readonly token: string;
  readonly flowId: string;
  readonly response: RegistrationResponseJSON;
  readonly requestId: string;
}

async function verifyInvitationRegistration(
  dependencies: OperatorEnrolmentDependencies,
  input: FinishOperatorEnrolmentInput
): Promise<VerifiedRegistration> {
  try {
    return await dependencies.verifyRegistration({
      redis: dependencies.redis,
      config: dependencies.config,
      flowId: input.flowId,
      response: input.response,
    });
  } catch (error) {
    throw invitationInvalid(error);
  }
}

interface ActivateInvitedOperatorInput {
  readonly prisma: PrismaClient;
  readonly operator: PlatformOperator;
  readonly invitationId: string;
  readonly verified: VerifiedRegistration;
  readonly requestId: string;
  readonly rpID: string;
}

async function activateInvitedOperator(
  input: ActivateInvitedOperatorInput
): Promise<PlatformOperator> {
  const { prisma, operator, invitationId, verified, requestId, rpID } = input;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await lockOperatorGovernance(tx);
    const claimed = await tx.operatorInvitation.updateMany({
      where: {
        id: invitationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) {
      throw invitationInvalid();
    }
    await tx.operatorPasskey.create({
      data: {
        operatorId: operator.id,
        credentialId: verified.credential.id,
        publicKey: verified.credential.publicKey,
        counter: verified.credential.counter,
        deviceType: verified.credential.deviceType,
        backedUp: verified.credential.backedUp,
        transports: verified.credential.transports.join(","),
        name: "Primary passkey",
        rpId: rpID,
      },
    });
    const activated = await tx.platformOperator.updateMany({
      where: { id: operator.id, status: OPERATOR_STATUS.INVITED },
      data: { status: OPERATOR_STATUS.ACTIVE, mfaEnrolled: true },
    });
    if (activated.count !== 1) {
      throw invitationInvalid();
    }
    const updated = await tx.platformOperator.findUniqueOrThrow({
      where: { id: operator.id },
    });
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: operator.id,
      action: PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED,
      entityType: OPERATOR_ENTITY_TYPE,
      entityId: operator.id,
      after: { rpID },
      requestId,
    });
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: operator.id,
      action: PLATFORM_AUDIT_ACTIONS.INVITATION_ACCEPTED,
      entityType: OPERATOR_INVITATION_ENTITY_TYPE,
      entityId: invitationId,
      requestId,
    });
    return updated;
  });
}

async function finishOperatorEnrolment(
  dependencies: OperatorEnrolmentDependencies,
  input: FinishOperatorEnrolmentInput
): Promise<OperatorSummary> {
  const verified = await verifyInvitationRegistration(dependencies, input);
  const tokenHash = await hashOperatorInvitationToken(input.token);
  if (verified.tokenHash !== tokenHash) {
    throw invitationInvalid();
  }
  const invitation = await findEnrolmentInvitation(
    dependencies.prisma,
    tokenHash,
    new Date()
  );
  if (invitation === null) {
    throw invitationInvalid();
  }
  const operator = await dependencies.prisma.platformOperator.findUnique({
    where: { id: verified.operatorId },
  });
  if (
    operator?.email !== invitation.email ||
    operator.status !== OPERATOR_STATUS.INVITED
  ) {
    throw invitationInvalid();
  }
  const activated = await activateInvitedOperator({
    prisma: dependencies.prisma,
    operator,
    invitationId: invitation.id,
    verified,
    requestId: input.requestId,
    rpID: dependencies.config.rpID,
  });
  const rows = await dependencies.prisma.operatorCapability.findMany({
    where: { operatorId: operator.id, revokedAt: null },
    select: { capability: true, revokedAt: true },
  });
  return toSummary(activated, activeCapabilities({ capabilities: rows }));
}

export function createOperatorEnrolmentService(
  dependencies: OperatorEnrolmentServiceDependencies
) {
  const runtime: OperatorEnrolmentDependencies = {
    ...dependencies,
    verifyRegistration:
      dependencies.verifyRegistration ?? finishRegistration,
  };
  return {
    start: (token: string) => startOperatorEnrolment(runtime, token),
    finish: (input: FinishOperatorEnrolmentInput) =>
      finishOperatorEnrolment(runtime, input),
  };
}

export interface OperatorServiceDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
}

export function createAdminOperatorService(
  dependencies: OperatorServiceDependencies
) {
  return {
    list: (input: { readonly cursor?: string; readonly limit: number }) =>
      listOperators(dependencies.prisma, input),
    create: (input: CreateOperatorInput, actor: OperatorActor) =>
      createOperator({ prisma: dependencies.prisma, input, actor }),
    updateStatus: (input: UpdateOperatorStatusInput) =>
      updateOperatorStatus({
        ...input,
        prisma: dependencies.prisma,
        redis: dependencies.redis,
      }),
    changeCapabilities: (input: ChangeOperatorCapabilitiesInput) =>
      changeOperatorCapabilities({
        ...input,
        prisma: dependencies.prisma,
        redis: dependencies.redis,
      }),
  };
}
