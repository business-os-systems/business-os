/**
 * Canonical quota resource keys (FR-024, FR-028, FR-091).
 *
 * Keys are namespaced by the owning application so a limit can never collide
 * across modules. The database stores the key verbatim; the usage view
 * (platform.v_tenant_usage) measures only the keys that have a real source.
 * Storage is declared but not measurable until metering exists, so the view
 * reports its consumption as unavailable rather than zero.
 */

export const QUOTA_KEYS = {
  PAGES: "cms.pages",
  STORAGE: "media.storage",
  CUSTOM_DOMAINS: "cms.custom_domains",
  BRANCHES: "core.branches",
  MEMBERS: "core.members",
} as const;

export type QuotaKey = (typeof QUOTA_KEYS)[keyof typeof QUOTA_KEYS];

export type QuotaUnit = "count" | "bytes";

export interface QuotaResourceDefinition {
  readonly label: string;
  readonly unit: QuotaUnit;
  readonly measurable: boolean;
}

export const QUOTA_RESOURCE_DEFINITIONS: Record<
  QuotaKey,
  QuotaResourceDefinition
> = {
  "cms.pages": { label: "Pages", unit: "count", measurable: true },
  "media.storage": { label: "Storage", unit: "bytes", measurable: false },
  "cms.custom_domains": {
    label: "Custom domains",
    unit: "count",
    measurable: true,
  },
  "core.branches": { label: "Branches", unit: "count", measurable: true },
  "core.members": { label: "Members", unit: "count", measurable: true },
};

export const QUOTA_KEY_CODES: readonly QuotaKey[] = Object.freeze(
  Object.values(QUOTA_KEYS),
);

const QUOTA_KEY_CODE_SET: ReadonlySet<string> = new Set(QUOTA_KEY_CODES);

export function isQuotaKey(value: string): value is QuotaKey {
  return QUOTA_KEY_CODE_SET.has(value);
}

/** The largest signed 64-bit value a quota limit may carry (PostgreSQL bigint). */
export const MAX_QUOTA_LIMIT = 9223372036854775807n;
