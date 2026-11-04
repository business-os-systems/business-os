import { Prisma, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  TENANT_LIFECYCLE_ACTION,
  TENANT_LIFECYCLE_REASON_CODES,
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
  TENANT_STATUS,
  getTenantLifecycleTransition,
  normalizeTenantStatus,
  resolveRestoreTarget,
  tenantLifecycleEventSchema,
  type TenantLifecycleAction,
  type TenantLifecycleEvent,
  type TenantStatus,
} from "@suite/core";
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  ValidationError,
  type AppError,
} from "@suite/core/errors";
import { appendPlatformOutboxEvent } from "../../workers/platform-outbox.worker.js";
import { throwMappedPlatformSqlError } from "./platform-sql-errors.js";
import { readTenantOverview } from "./tenant-view.service.js";

const REASON_REQUIRED_MESSAGE = `A reason of ${TENANT_LIFECYCLE_REASON_MIN_LENGTH} to ${TENANT_LIFECYCLE_REASON_MAX_LENGTH} characters is required.`;

export interface ChangeTenantStatusInput {
  readonly organizationId: string;
  readonly action: TenantLifecycleAction;
  readonly expectedStatus: TenantStatus;
  readonly reason: string;
  readonly operatorId: string;
  readonly requestId: string;
  readonly confirmationSlug?: string;
}

export interface TenantLifecycleResult {
  readonly lifecycleEventId: string;
  readonly fromStatus: TenantStatus;
  readonly toStatus: TenantStatus;
  readonly occurredAt: string;
}

interface TenantStatusChangeRow {
  readonly lifecycleEventId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly occurredAt: Date;
}

const LIFECYCLE_RULES: readonly {
  readonly sqlState: string;
  readonly messagePattern?: RegExp;
  readonly create: () => AppError;
}[] = [
  {
    sqlState: "PT422",
    messagePattern: /INVALID_TRANSITION/,
    create: () =>
      new ValidationError(
        "That lifecycle transition is not allowed from this tenant's state.",
        undefined,
        { code: PLATFORM_ERROR_CODE.INVALID_TRANSITION }
      ),
  },
  {
    sqlState: "PT409",
    create: () =>
      new ConflictError(
        "The tenant's status changed since it was observed. Reload the record and retry.",
        { code: PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT }
      ),
  },
  {
    sqlState: "PT404",
    create: () =>
      new NotFoundError("Tenant not found.", {
        code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
      }),
  },
  {
    sqlState: "PT403",
    create: () =>
      new ForbiddenError("Capability denied.", {
        code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      }),
  },
  {
    sqlState: "PT422",
    create: () =>
      new ValidationError(REASON_REQUIRED_MESSAGE, undefined, {
        code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      }),
  },
];

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (
    trimmed.length < TENANT_LIFECYCLE_REASON_MIN_LENGTH ||
    trimmed.length > TENANT_LIFECYCLE_REASON_MAX_LENGTH
  ) {
    throw new ValidationError(REASON_REQUIRED_MESSAGE, undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }
  return trimmed;
}

/**
 * The status a restore returns to is the one recorded before the suspension
 * (FR-018). It is read from the lifecycle history, never guessed: a suspended
 * tenant with no history is refused rather than silently activated.
 */
async function resolveRestoreStatus(options: {
  readonly prisma: PrismaClient;
  readonly organizationId: string;
}): Promise<TenantStatus> {
  const suspension = await options.prisma.lifecycleEvent.findFirst({
    where: {
      organizationId: options.organizationId,
      toStatus: TENANT_STATUS.SUSPENDED,
    },
    orderBy: { occurredAt: "desc" },
    select: { fromStatus: true },
  });

  const before = suspension
    ? normalizeTenantStatus(suspension.fromStatus)
    : null;
  const target = before === null ? null : resolveRestoreTarget(before);

  if (target === null) {
    throw new ValidationError(
      "This tenant has no suspension to restore from.",
      undefined,
      { code: PLATFORM_ERROR_CODE.INVALID_TRANSITION }
    );
  }
  return target;
}

async function assertConfirmationSlug(options: {
  readonly prisma: PrismaClient;
  readonly organizationId: string;
  readonly confirmationSlug: string | undefined;
}): Promise<void> {
  const overview = await readTenantOverview(
    options.prisma,
    options.organizationId
  );
  if (overview === null) {
    throw new NotFoundError("Tenant not found.", {
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    });
  }
  if (overview.slug !== options.confirmationSlug) {
    throw new ValidationError(
      "The confirmation slug does not match this tenant.",
      undefined,
      { code: PLATFORM_ERROR_CODE.SLUG_MISMATCH }
    );
  }
}

async function resolveTargetStatus(
  prisma: PrismaClient,
  input: ChangeTenantStatusInput
): Promise<TenantStatus> {
  const transition = getTenantLifecycleTransition(input.action);

  if (transition.requiresConfirmationSlug) {
    await assertConfirmationSlug({
      prisma,
      organizationId: input.organizationId,
      confirmationSlug: input.confirmationSlug,
    });
  }

  if (transition.targetStatus === null) {
    return resolveRestoreStatus({
      prisma,
      organizationId: input.organizationId,
    });
  }
  return transition.targetStatus;
}

/**
 * The event is the published contract, and the operator's free-text reason is
 * not in it: the contract forbids personal data in any event field. The reason
 * stays in the lifecycle record and the audit row (FR-020).
 */
export function buildTenantLifecycleEvent(input: {
  readonly lifecycleEventId: string;
  readonly action: TenantLifecycleAction;
  readonly fromStatus: TenantStatus;
  readonly toStatus: TenantStatus;
  readonly occurredAt: Date;
  readonly organizationId: string;
  readonly operatorId: string;
  readonly requestId: string;
}): TenantLifecycleEvent {
  const transition = getTenantLifecycleTransition(input.action);
  const base = {
    id: input.lifecycleEventId,
    type: transition.eventType,
    version: 1 as const,
    occurredAt: input.occurredAt.toISOString(),
    actor: { type: "operator" as const, id: input.operatorId },
    organizationId: input.organizationId,
    correlationId: input.requestId,
  };

  if (input.action === TENANT_LIFECYCLE_ACTION.RESTORE) {
    return tenantLifecycleEventSchema.parse({
      ...base,
      data: { fromStatus: input.fromStatus, toStatus: input.toStatus },
    });
  }

  return tenantLifecycleEventSchema.parse({
    ...base,
    data: {
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reasonCode: TENANT_LIFECYCLE_REASON_CODES[input.action],
    },
  });
}

interface ApplyTransitionOptions {
  readonly tx: Prisma.TransactionClient;
  readonly input: ChangeTenantStatusInput;
  readonly expectedStatus: TenantStatus;
  readonly targetStatus: TenantStatus;
  readonly reason: string;
}

async function applyTransition(
  options: ApplyTransitionOptions
): Promise<TenantLifecycleResult> {
  const { tx, input, expectedStatus, targetStatus, reason } = options;
  const transition = getTenantLifecycleTransition(input.action);
  const rows = await tx.$queryRaw<TenantStatusChangeRow[]>(
    Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(
      ${input.organizationId},
      ${targetStatus},
      ${expectedStatus},
      ${reason},
      ${input.operatorId},
      ${input.requestId}
    )`
  );
  const row = rows[0];
  if (row === undefined) {
    throw new InternalServerError(
      "The lifecycle function returned no transition."
    );
  }

  const fromStatus = normalizeTenantStatus(row.fromStatus);
  const toStatus = normalizeTenantStatus(row.toStatus);
  if (fromStatus === null || toStatus === null) {
    throw new InternalServerError(
      "The lifecycle function returned an unknown status."
    );
  }

  await appendPlatformOutboxEvent(tx, {
    eventType: transition.eventType,
    payload: buildTenantLifecycleEvent({
      lifecycleEventId: row.lifecycleEventId,
      action: input.action,
      fromStatus,
      toStatus,
      occurredAt: row.occurredAt,
      organizationId: input.organizationId,
      operatorId: input.operatorId,
      requestId: input.requestId,
    }),
  });

  return {
    lifecycleEventId: row.lifecycleEventId,
    fromStatus,
    toStatus,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/**
 * Applies one lifecycle transition. The database function writes the state
 * change, the lifecycle record and the audit row under a row lock; this service
 * adds the outbox event in the same transaction, so a committed change can
 * never lose its event (CT-4, contracts/events.md).
 */
export async function changeTenantStatus(
  prisma: PrismaClient,
  input: ChangeTenantStatusInput
): Promise<TenantLifecycleResult> {
  const reason = requireReason(input.reason);
  const expectedStatus = normalizeTenantStatus(input.expectedStatus);
  if (expectedStatus === null) {
    throw new ValidationError("Unknown expected status.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }

  const targetStatus = await resolveTargetStatus(prisma, input);

  try {
    return await prisma.$transaction((tx) =>
      applyTransition({ tx, input, expectedStatus, targetStatus, reason })
    );
  } catch (error) {
    throwMappedPlatformSqlError(error, LIFECYCLE_RULES);
  }
}
