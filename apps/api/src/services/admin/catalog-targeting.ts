import { FeatureFlagClient } from "@suite/flags";
import {
  catalogTargetingSchema,
  type CatalogItemStatus,
  type CatalogTargeting,
} from "./app-catalog.contract.js";

/**
 * Catalog targeting resolver (T039, FR-007, FR-008).
 *
 * Availability is decided in one place and fail-closed: an unknown tenant
 * attribute never widens a filter, and an explicit deny always wins over an
 * allow. The caller resolves the item's optional feature flag first; a missing
 * or disabled flag is never treated as "no restriction".
 */

export const CATALOG_TARGETING_REASONS = {
  TARGETED: "TARGETED",
  NOT_ACTIVE: "NOT_ACTIVE",
  DENYLISTED: "DENYLISTED",
  ORGANIZATION_REQUIRED: "ORGANIZATION_REQUIRED",
  NOT_ALLOWLISTED: "NOT_ALLOWLISTED",
  PLAN_MISMATCH: "PLAN_MISMATCH",
  INDUSTRY_MISMATCH: "INDUSTRY_MISMATCH",
  FLAG_DISABLED: "FLAG_DISABLED",
} as const;

export type CatalogTargetingReason =
  (typeof CATALOG_TARGETING_REASONS)[keyof typeof CATALOG_TARGETING_REASONS];

export interface CatalogTargetingContext {
  /** Null means an operator preview, not a tenant request. */
  readonly organizationId: string | null;
  readonly plan: string | null;
  readonly industry: string | null;
  /** Resolved state of the item's flagKey; null when the flag is absent. */
  readonly flagEnabled: boolean | null;
}

export interface CatalogTargetingDecision {
  readonly targeted: boolean;
  readonly reason: CatalogTargetingReason;
}

export interface CatalogTargetableItem {
  readonly status: CatalogItemStatus;
  readonly targeting: CatalogTargeting;
  readonly flagKey: string | null;
}

function isDenylisted(targeting: CatalogTargeting, organizationId: string | null): boolean {
  return organizationId !== null && targeting.orgDenylist.includes(organizationId);
}

function resolveAllowlist(
  targeting: CatalogTargeting,
  organizationId: string | null,
): CatalogTargetingReason | null {
  if (targeting.orgAllowlist.length === 0) {
    return null;
  }
  if (organizationId === null) {
    return CATALOG_TARGETING_REASONS.ORGANIZATION_REQUIRED;
  }
  return targeting.orgAllowlist.includes(organizationId)
    ? null
    : CATALOG_TARGETING_REASONS.NOT_ALLOWLISTED;
}

function resolvePlan(
  targeting: CatalogTargeting,
  plan: string | null,
): CatalogTargetingReason | null {
  if (targeting.plans.length === 0) {
    return null;
  }
  return plan !== null && targeting.plans.includes(plan)
    ? null
    : CATALOG_TARGETING_REASONS.PLAN_MISMATCH;
}

function resolveIndustry(
  targeting: CatalogTargeting,
  industry: string | null,
): CatalogTargetingReason | null {
  if (targeting.industries.length === 0) {
    return null;
  }
  return industry !== null && targeting.industries.includes(industry)
    ? null
    : CATALOG_TARGETING_REASONS.INDUSTRY_MISMATCH;
}

function resolveFlag(
  flagKey: string | null,
  flagEnabled: boolean | null,
): CatalogTargetingReason | null {
  if (flagKey === null) {
    return null;
  }
  return flagEnabled === true ? null : CATALOG_TARGETING_REASONS.FLAG_DISABLED;
}

/**
 * Resolves one item against one tenant context. The first failing rule names
 * the refusal so an operator can explain why a tenant does not see an item.
 */
export function resolveCatalogTargeting(
  item: CatalogTargetableItem,
  context: CatalogTargetingContext,
): CatalogTargetingDecision {
  if (item.status !== "ACTIVE") {
    return {
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.NOT_ACTIVE,
    };
  }
  if (isDenylisted(item.targeting, context.organizationId)) {
    return {
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.DENYLISTED,
    };
  }
  const refusal =
    resolveAllowlist(item.targeting, context.organizationId) ??
    resolvePlan(item.targeting, context.plan) ??
    resolveIndustry(item.targeting, context.industry) ??
    resolveFlag(item.flagKey, context.flagEnabled);

  if (refusal !== null) {
    return { targeted: false, reason: refusal };
  }
  return { targeted: true, reason: CATALOG_TARGETING_REASONS.TARGETED };
}

/** FR-008: a tenant picker only ever receives active, targeted items. */
export function isCatalogItemAvailable(
  item: CatalogTargetableItem,
  context: CatalogTargetingContext,
): boolean {
  return resolveCatalogTargeting(item, context).targeted;
}

const featureFlags = new FeatureFlagClient();

export interface CatalogFlaggedRow {
  readonly flagKey: string | null;
}

/**
 * Resolves each distinct flag a catalog page declares for one tenant. The flag
 * client already fails closed; a missing flag is stored as false, never omitted.
 */
export async function readCatalogFlagStates(
  rows: readonly CatalogFlaggedRow[],
  organizationId: string,
): Promise<ReadonlyMap<string, boolean>> {
  const keys = [
    ...new Set(rows.map((row) => row.flagKey).filter((key): key is string => key !== null)),
  ];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await featureFlags.isEnabled(key, { organizationId })] as const),
  );
  return new Map(entries);
}

/** The tenant facts a catalog row is resolved against, including flag state. */
export interface CatalogTenantVisibilityContext {
  readonly organizationId: string;
  readonly plan: string | null;
  readonly industries: readonly string[];
  readonly flagStates: ReadonlyMap<string, boolean>;
}

export interface CatalogVisibilityRow {
  readonly status: CatalogItemStatus;
  readonly targeting: unknown;
  readonly flagKey: string | null;
}

function isTargetedForIndustry(input: {
  readonly row: CatalogVisibilityRow;
  readonly targeting: CatalogTargeting;
  readonly context: CatalogTenantVisibilityContext;
  readonly industry: string | null;
}): boolean {
  const { row, targeting, context, industry } = input;
  const flagEnabled =
    row.flagKey === null ? null : context.flagStates.get(row.flagKey) === true;
  return resolveCatalogTargeting(
    { status: row.status, targeting, flagKey: row.flagKey },
    {
      organizationId: context.organizationId,
      plan: context.plan,
      industry,
      flagEnabled,
    },
  ).targeted;
}

/**
 * FR-008: one visibility rule for every catalog kind. A malformed targeting
 * payload is not offered, and a tenant whose industries are unknown is tested
 * once against "no industry" so an industry filter fails closed.
 */
export function isCatalogItemVisibleToTenant(
  row: CatalogVisibilityRow,
  context: CatalogTenantVisibilityContext,
): boolean {
  const targeting = catalogTargetingSchema.safeParse(row.targeting);
  if (!targeting.success) {
    return false;
  }
  const industries = context.industries.length === 0 ? [null] : context.industries;
  return industries.some((industry) =>
    isTargetedForIndustry({ row, targeting: targeting.data, context, industry }),
  );
}
