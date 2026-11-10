/**
 * Canonical Platform capability registry.
 *
 * Capabilities are enumerated in code because each one has an enforcement
 * point; grants remain data. Adding one requires an enforcement point, a
 * denial test and documentation (AGENTS.md 5.2, CT-1).
 */

export const PLATFORM_CAPABILITY_GROUPS = [
  "Applications",
  "Tenants",
  "Governance",
  "Reference",
  "Support",
  "System",
] as const;

export type PlatformCapabilityGroup =
  (typeof PLATFORM_CAPABILITY_GROUPS)[number];

export interface PlatformCapabilityDefinition {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly group: PlatformCapabilityGroup;
}

export const PLATFORM_CAPABILITIES = {
  APPS_READ: {
    code: "platform:apps:read",
    label: "Read applications",
    description:
      "Read application records, catalog entries, settings and previews without authoring or publishing.",
    group: "Applications",
  },
  APPS_AUTHOR: {
    code: "platform:apps:author",
    label: "Author application content",
    description:
      "Edit application defaults and create draft catalog content without publishing.",
    group: "Applications",
  },
  TENANTS_READ: {
    code: "platform:tenants:read",
    label: "Read tenants",
    description:
      "Search tenants and read their records, installed apps and quotas.",
    group: "Tenants",
  },
  TENANTS_LIFECYCLE: {
    code: "platform:tenants:lifecycle",
    label: "Manage tenant lifecycle",
    description:
      "Suspend, restore and archive tenants with a recorded reason.",
    group: "Tenants",
  },
  QUOTAS_MANAGE: {
    code: "platform:quotas:manage",
    label: "Manage quotas",
    description: "Read and change per-tenant resource limits.",
    group: "Tenants",
  },
  ENTITLEMENTS_MANAGE: {
    code: "platform:entitlements:manage",
    label: "Manage entitlements",
    description:
      "Read and change installed apps, catalog overrides and validated app settings.",
    group: "Tenants",
  },
  OPERATORS_MANAGE: {
    code: "platform:operators:manage",
    label: "Manage operators",
    description:
      "Invite operators and grant or revoke platform capabilities.",
    group: "Governance",
  },
  PII_READ: {
    code: "platform:pii:read",
    label: "Read personal data",
    description: "Read tenant personal data with a recorded reason.",
    group: "Governance",
  },
  AUDIT_READ: {
    code: "platform:audit:read",
    label: "Read audit trail",
    description: "Search and verify the platform audit chain.",
    group: "Governance",
  },
  CATALOGS_MANAGE: {
    code: "platform:catalogs:manage",
    label: "Manage reference catalogs",
    description:
      "Add, relabel, reorder and retire shared reference values.",
    group: "Reference",
  },
  IMPERSONATE: {
    code: "platform:impersonate",
    label: "Start support sessions",
    description:
      "Open a time-boxed, read-only support session into a tenant workspace.",
    group: "Support",
  },
  TELEMETRY_READ: {
    code: "platform:telemetry:read",
    label: "View platform health",
    description:
      "Read platform health, queue depth and operational telemetry.",
    group: "System",
  },
  FLAGS_MANAGE: {
    code: "platform:flags:manage",
    label: "Manage feature flags",
    description: "Read and change platform feature-flag state.",
    group: "System",
  },
} as const satisfies Record<string, PlatformCapabilityDefinition>;

export type PlatformCapabilityKey = keyof typeof PLATFORM_CAPABILITIES;

/**
 * Capabilities that grant read access to an application record. The dedicated
 * reader is the narrow grant; the catalog/entitlement manager keeps the access
 * it already had before the dedicated capability existed.
 */
export const PLATFORM_APPS_READ_CAPABILITIES = [
  PLATFORM_CAPABILITIES.APPS_READ.code,
  PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
] as const;

/** Fail-closed read check shared by the Platform UI and the API guard. */
export function hasPlatformAppsReadAccess(
  capabilities: readonly string[] | undefined | null
): boolean {
  if (capabilities === undefined || capabilities === null) {
    return false;
  }
  return PLATFORM_APPS_READ_CAPABILITIES.some((capability) =>
    capabilities.includes(capability)
  );
}

export type PlatformCapability =
  (typeof PLATFORM_CAPABILITIES)[PlatformCapabilityKey]["code"];

export const PLATFORM_CAPABILITY_CODES: readonly PlatformCapability[] =
  Object.freeze(
    Object.values(PLATFORM_CAPABILITIES).map((capability) => capability.code)
  );

const PLATFORM_CAPABILITY_CODE_SET: ReadonlySet<string> = new Set(
  PLATFORM_CAPABILITY_CODES
);

export function isPlatformCapability(
  value: string
): value is PlatformCapability {
  return PLATFORM_CAPABILITY_CODE_SET.has(value);
}

export function getPlatformCapability(
  code: PlatformCapability
): PlatformCapabilityDefinition {
  const definition = Object.values(PLATFORM_CAPABILITIES).find(
    (capability) => capability.code === code
  );
  if (definition === undefined) {
    throw new Error(`Unknown platform capability: ${code}`);
  }
  return definition;
}
