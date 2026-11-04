/**
 * Canonical tenant lifecycle vocabulary and transition matrix.
 *
 * The database is the enforcement point: platform.fn_set_tenant_status applies
 * the same matrix under a row lock and answers LIFECYCLE_CONFLICT when the
 * caller's expectedStatus is stale. This registry exists so the API can reject
 * an impossible request before it writes, and so the tenant plane can name the
 * state it is showing. A status that exists in the database but not here is a
 * defect, not a runtime case.
 */

export const TENANT_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Named access to a status without repeating the string at each call site. */
export const TENANT_STATUS = {
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  SUSPENDED: "SUSPENDED",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<TenantStatus, TenantStatus>;

/** The database and the API enforce the same reason bounds (FR-016). */
export const TENANT_LIFECYCLE_REASON_MIN_LENGTH = 5;
export const TENANT_LIFECYCLE_REASON_MAX_LENGTH = 255;

export const TENANT_LIFECYCLE_ACTIONS = [
  "SUSPEND",
  "RESTORE",
  "ARCHIVE",
] as const;

export type TenantLifecycleAction = (typeof TENANT_LIFECYCLE_ACTIONS)[number];

export const TENANT_LIFECYCLE_ACTION = {
  SUSPEND: "SUSPEND",
  RESTORE: "RESTORE",
  ARCHIVE: "ARCHIVE",
} as const satisfies Record<TenantLifecycleAction, TenantLifecycleAction>;

/**
 * Event names are part of the published contract (contracts/events.md); a
 * consumer subscribes to these exact strings.
 */
export const TENANT_LIFECYCLE_EVENT_TYPES = {
  SUSPEND: "platform.tenant.suspended",
  RESTORE: "platform.tenant.restored",
  ARCHIVE: "platform.tenant.archived",
} as const satisfies Record<TenantLifecycleAction, string>;

/**
 * The event payload carries this code, never the operator's free text: the
 * recorded reason stays in platform.lifecycle_events and the audit row, where
 * it is readable only by the control plane (FR-020, events contract rule 3).
 */
export const TENANT_LIFECYCLE_REASON_CODES = {
  SUSPEND: "OPERATOR_SUSPEND",
  RESTORE: "OPERATOR_RESTORE",
  ARCHIVE: "OPERATOR_ARCHIVE",
} as const satisfies Record<TenantLifecycleAction, string>;

export interface TenantLifecycleTransition {
  readonly action: TenantLifecycleAction;
  /** Target status; null means "the status recorded before the suspension". */
  readonly targetStatus: TenantStatus | null;
  readonly allowedFrom: readonly TenantStatus[];
  /** Archive requires the operator to retype the tenant slug (FR-019). */
  readonly requiresConfirmationSlug: boolean;
  readonly eventType: string;
}

export const TENANT_LIFECYCLE_TRANSITIONS = {
  SUSPEND: {
    action: "SUSPEND",
    targetStatus: "SUSPENDED",
    allowedFrom: ["TRIAL", "ACTIVE", "PAST_DUE"],
    requiresConfirmationSlug: false,
    eventType: TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND,
  },
  RESTORE: {
    action: "RESTORE",
    targetStatus: null,
    allowedFrom: ["SUSPENDED"],
    requiresConfirmationSlug: false,
    eventType: TENANT_LIFECYCLE_EVENT_TYPES.RESTORE,
  },
  ARCHIVE: {
    action: "ARCHIVE",
    targetStatus: "ARCHIVED",
    allowedFrom: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"],
    requiresConfirmationSlug: true,
    eventType: TENANT_LIFECYCLE_EVENT_TYPES.ARCHIVE,
  },
} as const satisfies Record<TenantLifecycleAction, TenantLifecycleTransition>;

const TENANT_STATUS_SET: ReadonlySet<string> = new Set(TENANT_STATUSES);

export function isTenantStatus(value: string): value is TenantStatus {
  return TENANT_STATUS_SET.has(value);
}

/**
 * Normalises a boundary value (database column, cache entry, request body).
 * Returns null rather than throwing: callers answer a typed problem detail or
 * deny, and a malformed value can never be mistaken for a canonical status.
 */
export function normalizeTenantStatus(value: unknown): TenantStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return isTenantStatus(normalized) ? normalized : null;
}

export function getTenantLifecycleTransition(
  action: TenantLifecycleAction
): TenantLifecycleTransition {
  return TENANT_LIFECYCLE_TRANSITIONS[action];
}

export function canApplyLifecycleAction(
  action: TenantLifecycleAction,
  fromStatus: TenantStatus
): boolean {
  const transition: TenantLifecycleTransition =
    TENANT_LIFECYCLE_TRANSITIONS[action];
  return transition.allowedFrom.includes(fromStatus);
}

/**
 * A restore returns the tenant to the status it held before the suspension.
 * The caller passes the fromStatus of the latest SUSPEND event; a value that
 * cannot be restored (a suspend-without-history) is refused rather than
 * guessed.
 */
export function resolveRestoreTarget(
  statusBeforeSuspension: TenantStatus
): TenantStatus | null {
  const suspend: TenantLifecycleTransition = TENANT_LIFECYCLE_TRANSITIONS.SUSPEND;
  return suspend.allowedFrom.includes(statusBeforeSuspension)
    ? statusBeforeSuspension
    : null;
}

/** Statuses that block every tenant-plane interaction until resolved. */
export const BLOCKING_TENANT_STATUSES = ["SUSPENDED", "ARCHIVED"] as const;

export type BlockingTenantStatus = (typeof BLOCKING_TENANT_STATUSES)[number];

export function isBlockingTenantStatus(
  status: string
): status is BlockingTenantStatus {
  return (BLOCKING_TENANT_STATUSES as readonly string[]).includes(status);
}
