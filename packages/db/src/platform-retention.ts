/**
 * Retention policy for every Platform-owned table and every Website Builder
 * table (OP-6, T145, T022). The cms rows were added when the cms schema became
 * an independent application plane.
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

const TENANT_OFFBOARDING = "owner-only tenant offboarding procedure";
const SITE_RETENTION = "life of the site";
const SITE_DELETION = "site deletion path";

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
    enforcedBy: TENANT_OFFBOARDING,
  },
  {
    table: "app_settings_defaults",
    retention: "life of the platform",
    disposition: "retain",
    personalData: false,
    basis: "Application settings defaults; configuration values, no personal data.",
    enforcedBy: "no prune required",
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
  {
    table: "cms_sites",
    retention: "life of the tenant + 30 days",
    disposition: "archive_then_delete",
    personalData: false,
    basis: "Tenant website configuration; deleted when the tenant is offboarded.",
    enforcedBy: "owner-only tenant offboarding procedure (retention.md)",
  },
  {
    table: "cms_site_settings",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "Brand, header and footer configuration for one site.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_site_appearances",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis:
      "A site's own complete token snapshot, draft and published copies plus the source theme id; deleted with the site.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_domains",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "Hostname claims are released when the site or domain is deleted.",
    enforcedBy: "site/domain deletion path",
  },
  {
    table: "cms_pages",
    retention: "life of the site + 30 days",
    disposition: "archive_then_delete",
    personalData: false,
    basis: "Page tree and publication status.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_page_contents",
    retention: "life of the page",
    disposition: "delete",
    personalData: false,
    basis: "Draft and published AST for one page.",
    enforcedBy: "page deletion path",
  },
  {
    table: "cms_page_versions",
    retention: "newest 30 per page, then life of the page",
    disposition: "delete",
    personalData: false,
    basis: "Published snapshots; the newest 30 are kept per page by default (FR-033).",
    enforcedBy: "page version prune procedure",
  },
  {
    table: "cms_page_comments",
    retention: "life of the page + 30 days",
    disposition: "delete",
    personalData: true,
    basis: "Author id, comment text and canvas coordinates identify a person.",
    enforcedBy: "page deletion path",
  },
  {
    table: "cms_collections",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "Collection schema and slug.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_collection_items",
    retention: "life of the collection",
    disposition: "delete",
    personalData: false,
    basis: "Collection content rows.",
    enforcedBy: "collection deletion path",
  },
  {
    table: "cms_themes",
    retention: "life of the tenant; global presets for the life of the platform",
    disposition: "archive_then_delete",
    personalData: false,
    basis: "Tenant brand themes and platform-global presets.",
    enforcedBy: TENANT_OFFBOARDING,
  },
  {
    table: "cms_templates",
    retention: "life of the tenant; global presets for the life of the platform",
    disposition: "archive_then_delete",
    personalData: false,
    basis: "Tenant templates and platform-global presets.",
    enforcedBy: TENANT_OFFBOARDING,
  },
  {
    table: "cms_section_templates",
    retention: "life of the tenant; global presets for the life of the platform",
    disposition: "archive_then_delete",
    personalData: false,
    basis: "Tenant block presets and platform-global presets.",
    enforcedBy: TENANT_OFFBOARDING,
  },
  {
    table: "cms_site_seo_settings",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "SEO and GEO metadata for one site.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_site_locales",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "Enabled locales for one site.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_page_translations",
    retention: "life of the page",
    disposition: "delete",
    personalData: false,
    basis: "Translated AST and title.",
    enforcedBy: "page deletion path",
  },
  {
    table: "cms_url_redirects",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "Redirect map for one site.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_inquiries",
    retention: "365 days after receipt, or earlier through erasure",
    disposition: "delete",
    personalData: true,
    basis:
      "Inquiry payload, hashed email and submitter hash; erasure can shorten the window but never extend it.",
    enforcedBy: "inquiry retention job + erasure path",
  },
  {
    table: "cms_inquiry_events",
    retention: "life of the inquiry",
    disposition: "delete",
    personalData: true,
    basis:
      "Inquiry lifecycle history (status changes, PII views, erasure) retained with its inquiry, then deleted.",
    enforcedBy: "inquiry retention job + erasure path",
  },
  {
    table: "cms_site_analytics_daily",
    retention: "25 months",
    disposition: "delete",
    personalData: false,
    basis: "Aggregated visit counts, no personal data.",
    enforcedBy: "analytics prune procedure",
  },
  {
    table: "cms_plugin_installations",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: true,
    basis: "Encrypted third-party credentials are bound to a tenant and site.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_navigation_menus",
    retention: SITE_RETENTION,
    disposition: "delete",
    personalData: false,
    basis: "Menu configuration.",
    enforcedBy: SITE_DELETION,
  },
  {
    table: "cms_audit_trails",
    retention: "24 months",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Actor id and entity history; retained for investigation.",
    enforcedBy: "owner-only archive procedure (retention.md)",
  },
  {
    table: "cms_catalog_items",
    retention: "life of the platform; retired rows remain resolvable",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Actor ids on the working draft and lifecycle; retired catalog rows are never deleted (FR-004).",
    enforcedBy: "owner-only catalog retirement procedure",
  },
  {
    table: "cms_catalog_item_versions",
    retention: "life of the catalog item",
    disposition: "archive_then_delete",
    personalData: true,
    basis: "Immutable snapshot with publisher id; a published version is never rewritten.",
    enforcedBy: "owner-only catalog archive procedure",
  },
  {
    table: "media_assets",
    retention: "life of the tenant, or immediately when deleted while unused",
    disposition: "delete",
    personalData: true,
    basis:
      "Tenant-uploaded images can contain people or personal documents; an asset is removed when the tenant deletes it and no PUBLISHED usage exists.",
    enforcedBy:
      "media delete path (DELETE /api/v1/media/assets/{id}) + owner tenant-offboarding procedure",
  },
  {
    table: "media_usages",
    retention: "life of the referencing content",
    disposition: "delete",
    personalData: false,
    basis:
      "A usage is a reference by identity; it has no value after the referencing content is removed.",
    enforcedBy: "usage removal path and the asset deletion transaction",
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
