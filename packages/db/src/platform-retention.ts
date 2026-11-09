/**
 * Retention policy for every Platform-owned table (OP-6, T145).
 *
 * The policy is deliberately conservative: personal data is bounded and is
 * never declared "retain". The audit chain is archive-then-delete because a
 * plain DELETE would break the hash chain; the owner procedure is documented
 * in specs/005-super-dashboard/retention.md.
 */
export type RetentionDisposition = "delete" | "archive_then_delete" | "retain";

export interface PlatformRetentionPolicy {
  readonly table: string;
  readonly retention: string;
  readonly disposition: RetentionDisposition;
  readonly personalData: boolean;
  readonly basis: string;
  readonly enforcedBy: string;
}

export const PLATFORM_RETENTION = [
  {
    table: "operators",
    retention: "life of the operator + 24 months",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Accountability after offboarding; the actor id remains in the audit chain.",
    enforcedBy: "owner-only offboarding procedure (retention.md)",
  },
  {
    table: "operator_passkeys",
    retention: "life of the operator",
    disposition: "delete",
    personalData: true,
    basis: "Credential material has no value after revocation.",
    enforcedBy: "operator revocation path deletes passkeys",
  },
  {
    table: "operator_sessions",
    retention: "8 hours after expiry or revocation",
    disposition: "delete",
    personalData: true,
    basis: "Session token hash, IP and user agent; FR-072 bounds the lifetime.",
    enforcedBy: "session revocation path + retention job (retention.md)",
  },
  {
    table: "operator_capabilities",
    retention: "life of the operator",
    disposition: "delete",
    personalData: false,
    basis: "Grants are deleted with the operator.",
    enforcedBy: "operator offboarding procedure",
  },
  {
    table: "operator_invitations",
    retention: "24 hours after expiry or acceptance",
    disposition: "delete",
    personalData: true,
    basis: "Invitation email and single-use token; no value after expiry.",
    enforcedBy: "invitation expiry/cleanup path",
  },
  {
    table: "lifecycle_events",
    retention: "24 months",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Tenant lifecycle history; actor and reason can identify a person.",
    enforcedBy: "owner-only archive procedure (retention.md)",
  },
  {
    table: "quotas",
    retention: "life of the tenant + 24 months",
    disposition: "archive_then_delete",
    personalData: false,
    basis: "Tenant resource limits; no personal data.",
    enforcedBy: "owner-only tenant offboarding procedure",
  },
  {
    table: "app_overrides",
    retention: "life of the platform",
    disposition: "retain",
    personalData: false,
    basis: "Platform presentation configuration; no personal data.",
    enforcedBy: "no prune required",
  },
  {
    table: "impersonation_sessions",
    retention: "24 months",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Support-session reason, IP and user agent; retained for investigation.",
    enforcedBy: "owner-only archive procedure (retention.md)",
  },
  {
    table: "audit_events",
    retention: "24 months, chain-safe archive before pruning",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Tamper-evident chain; a plain DELETE would break link verification.",
    enforcedBy: "owner-only chain-safe archive procedure (retention.md)",
  },
  {
    table: "outbox_events",
    retention: "30 days after DONE or DEAD",
    disposition: "delete",
    personalData: false,
    basis: "Delivery state only; the event payload is not a second source of truth.",
    enforcedBy: "outbox dispatcher cleanup procedure",
  },
  {
    table: "system_feature_flags",
    retention: "life of the platform",
    disposition: "retain",
    personalData: false,
    basis: "Flag configuration.",
    enforcedBy: "no prune required",
  },
  {
    table: "system_feature_flag_rules",
    retention: "life of the flag",
    disposition: "delete",
    personalData: false,
    basis: "Targeting rules are deleted with the flag.",
    enforcedBy: "flag deletion path",
  },
  {
    table: "system_feature_flag_audit_logs",
    retention: "24 months",
    disposition: "delete",
    personalData: true,
    basis: "Flag audit history; the actor id is personal data.",
    enforcedBy: "apps/api/scripts/prune-flag-audit.ts + deploy/platform/prune-flag-audit-logs.sql",
  },
] as const satisfies readonly PlatformRetentionPolicy[];

export class UnknownRetentionPolicyError extends Error {
  constructor(table: string) {
    super(`No retention policy is declared for "${table}".`);
    this.name = "UnknownRetentionPolicyError";
  }
}

export function getPlatformRetentionPolicy(table: string): PlatformRetentionPolicy {
  const policy = PLATFORM_RETENTION.find((entry) => entry.table === table);
  if (policy === undefined) {
    throw new UnknownRetentionPolicyError(table);
  }
  return policy;
}
