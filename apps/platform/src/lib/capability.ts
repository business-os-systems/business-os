import {
  PLATFORM_CAPABILITIES,
  hasPlatformAppsReadAccess,
} from "@suite/core";

/**
 * One fail-closed platform capability predicate. Missing or empty context
 * denies, so navigation, PII and lifecycle gates cannot drift apart.
 */
export function hasPlatformCapability(
  capabilities: readonly string[] | undefined | null,
  required: string,
): boolean {
  if (capabilities === undefined || capabilities === null) {
    return false;
  }
  return capabilities.includes(required);
}

export function canReadApps(
  capabilities: readonly string[] | undefined | null,
): boolean {
  return hasPlatformAppsReadAccess(capabilities);
}

export function canAuthorApps(
  capabilities: readonly string[] | undefined | null,
): boolean {
  return hasPlatformCapability(
    capabilities,
    PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
  );
}

export function canReadTenants(
  capabilities: readonly string[] | undefined | null,
): boolean {
  return hasPlatformCapability(
    capabilities,
    PLATFORM_CAPABILITIES.TENANTS_READ.code,
  );
}

export function canManageEntitlements(
  capabilities: readonly string[] | undefined | null,
): boolean {
  return hasPlatformCapability(
    capabilities,
    PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
  );
}

export function canManageQuotas(
  capabilities: readonly string[] | undefined | null,
): boolean {
  return hasPlatformCapability(
    capabilities,
    PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
  );
}
