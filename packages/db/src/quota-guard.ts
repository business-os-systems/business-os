import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PLATFORM_ERROR_CODE,
  QUOTA_KEYS,
  QUOTA_RESOURCE_DEFINITIONS,
  isQuotaKey,
} from "@suite/core";
import {
  InternalServerError,
  QuotaExceededError,
  ValidationError,
} from "@suite/core/errors";

/**
 * The tenant write paths connect with the tenant identity and intentionally
 * cannot read platform.quotas (DB-2). Enforcement therefore runs through one
 * narrow SECURITY DEFINER gate that returns a decision, never the control-plane
 * tables.
 *
 * The caller sets the transaction-local tenant context to the organization it
 * is already operating on; the gate refuses a missing context. This is a
 * correctness guard inside the trusted tenant runtime, not an authorization
 * boundary between tenants. Callers must pass a tenant id from the verified
 * session, never a request-supplied id.
 *
 * Callers must use a bounded transaction: the gate takes a transaction-scoped
 * advisory lock, and the caller's transaction timeout bounds the wait.
 */
export const TENANT_CONTEXT_SETTING = "app.current_organization_id";

export interface QuotaCheckInput {
  readonly organizationId: string;
  readonly resourceKey: string;
  /** How many units the pending write adds. Defaults to one. */
  readonly delta?: number;
}

export interface QuotaAvailability {
  readonly resourceKey: string;
  readonly limitValue: bigint;
  readonly currentValue: bigint | null;
  readonly unit: string | null;
  readonly isMeasurable: boolean;
  readonly isEnforced: boolean;
  readonly allowed: boolean;
  readonly isOverLimit: boolean;
}

/**
 * Both the root client and a transaction client satisfy this narrow shape, but
 * the guard must be called with a transaction client. The tenant context is set
 * with `set_config(..., true)`, which is transaction-local; a root client's next
 * statement is a new implicit transaction and sees no context, so the gate fails
 * closed. The advisory lock is equally transaction-scoped.
 */
export type QuotaGuardClient = Pick<PrismaClient, "$queryRaw">;

export interface QuotaGuard {
  assertAvailable(
    client: QuotaGuardClient,
    input: QuotaCheckInput
  ): Promise<void>;
}

function requireQuotaKey(resourceKey: string): void {
  if (isQuotaKey(resourceKey)) {
    return;
  }
  throw new ValidationError(
    "Unknown quota resource key.",
    [{ name: "resourceKey", reason: `Unknown quota resource key: ${resourceKey}` }],
    { code: PLATFORM_ERROR_CODE.UNKNOWN_RESOURCE_KEY }
  );
}

function requireDelta(delta: number): void {
  if (Number.isSafeInteger(delta) && delta >= 0) {
    return;
  }
  throw new ValidationError(
    "The quota delta must be a non-negative integer.",
    [{ name: "delta", reason: "Use a non-negative integer." }],
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
  );
}

function toQuotaUnit(value: string | null): "count" | "bytes" | null {
  if (value === null || value === "count" || value === "bytes") {
    return value;
  }
  throw new InternalServerError("The quota gate returned an unknown unit.");
}

/**
 * Sets the transaction-local tenant context and asks the definer gate for a
 * decision. A tenant with no configured quota returns no row and is unlimited.
 * The gate takes a transaction-scoped advisory lock, so when this call shares
 * the write transaction two concurrent creates cannot both pass the last seat.
 */
export async function readQuotaAvailability(
  client: QuotaGuardClient,
  input: QuotaCheckInput
): Promise<QuotaAvailability | null> {
  requireQuotaKey(input.resourceKey);
  const delta = input.delta ?? 1;
  requireDelta(delta);

  await client.$queryRaw(
    Prisma.sql`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${input.organizationId}, true)`
  );

  const rows = await client.$queryRaw<QuotaAvailability[]>(Prisma.sql`
    SELECT
      "resourceKey",
      "limitValue",
      "currentValue",
      "unit",
      "isMeasurable",
      "isEnforced",
      "allowed",
      "isOverLimit"
    FROM public.fn_assert_quota_available(
      ${input.organizationId},
      ${input.resourceKey},
      ${delta}
    )
  `);

  return rows[0] ?? null;
}

/**
 * FR-091: an unmeasurable resource is never enforced. FR-026: a lowered limit
 * blocks new writes but never touches existing rows. The gate performs both
 * rules; this helper only turns a refusal into the typed 409 the write path
 * renders.
 */
export async function assertQuotaAvailable(
  client: QuotaGuardClient,
  input: QuotaCheckInput
): Promise<void> {
  const availability = await readQuotaAvailability(client, input);
  if (
    availability === null ||
    !availability.isEnforced ||
    !availability.isMeasurable ||
    availability.allowed
  ) {
    return;
  }

  if (!isQuotaKey(input.resourceKey)) {
    throw new InternalServerError("The quota gate accepted an unknown key.");
  }
  if (availability.currentValue === null) {
    throw new InternalServerError(
      "The quota gate returned no consumption for an enforced limit."
    );
  }

  const definition = QUOTA_RESOURCE_DEFINITIONS[input.resourceKey];
  throw new QuotaExceededError({
    resourceKey: input.resourceKey,
    resourceLabel: definition.label,
    limitValue: availability.limitValue.toString(),
    currentValue: availability.currentValue.toString(),
    unit: toQuotaUnit(availability.unit),
  });
}

/**
 * The tenant write points that may consume a measured quota. Storage is the
 * media finalise path: a create is charged the uploaded bytes, while a
 * checksum duplicate returns the existing asset and is charged nothing
 * (FR-052, FR-122). This is the single allowlist; the default guard used by
 * tenant services is the allowlist adapter so a composition cannot silently
 * bypass it.
 */
export const TENANT_WRITE_QUOTA_KEYS = {
  PAGE: QUOTA_KEYS.PAGES,
  CUSTOM_DOMAIN: QUOTA_KEYS.CUSTOM_DOMAINS,
  BRANCH: QUOTA_KEYS.BRANCHES,
  MEMBER: QUOTA_KEYS.MEMBERS,
  STORAGE: QUOTA_KEYS.STORAGE,
} as const;

const TENANT_WRITE_KEY_SET: ReadonlySet<string> = new Set(
  Object.values(TENANT_WRITE_QUOTA_KEYS)
);

/**
 * Enforces the tenant-write allowlist before delegating to the primitive. An
 * unknown key and a key that is simply not a tenant write point are distinct
 * failures: the former is UNKNOWN_RESOURCE_KEY, the latter VALIDATION_FAILED.
 */
export async function assertTenantWriteQuotaAvailable(
  client: QuotaGuardClient,
  input: QuotaCheckInput
): Promise<void> {
  if (!TENANT_WRITE_KEY_SET.has(input.resourceKey)) {
    throw new ValidationError(
      "The resource is not a tenant write point.",
      [
        {
          name: "resourceKey",
          reason: `${input.resourceKey} is not enforced at a tenant write point.`,
        },
      ],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
  await assertQuotaAvailable(client, input);
}

export const databaseQuotaGuard: QuotaGuard = {
  assertAvailable: assertQuotaAvailable,
};

/** The default guard for tenant write services: primitive + write-point policy. */
export const tenantWriteQuotaGuard: QuotaGuard = {
  assertAvailable: assertTenantWriteQuotaAvailable,
};
