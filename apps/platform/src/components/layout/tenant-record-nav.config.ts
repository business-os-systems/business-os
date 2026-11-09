import {
  PLATFORM_CAPABILITIES,
  type PlatformCapability,
} from "@suite/core";
import { hasPlatformCapability } from "@/lib/capability";

/**
 * Tenant record hub configuration (Hub Navigation Law H-3.5/H-3.13).
 *
 * Every destination is declared here and rendered as a route. Adding a panel is
 * a config edit; no component knows the list by name. Reading groups come
 * first and the destructive group is last (H-3.8).
 */

export type TenantRecordNavItemId =
  | "overview"
  | "apps"
  | "quotas"
  | "activity"
  | "support"
  | "danger";

export type TenantRecordIconKey = TenantRecordNavItemId;

export const TENANT_RECORD_ROUTE_PREFIX = "/tenants";

export const TENANT_RECORD_BACK_LINK = {
  label: "All tenants",
  href: TENANT_RECORD_ROUTE_PREFIX,
} as const;

export interface TenantRecordNavItem {
  readonly id: TenantRecordNavItemId;
  readonly label: string;
  readonly segment: string;
  readonly icon: TenantRecordIconKey;
  readonly capability: PlatformCapability;
}

export interface TenantRecordNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly TenantRecordNavItem[];
}

export const TENANT_RECORD_NAV_GROUPS: readonly TenantRecordNavGroup[] = [
  {
    id: "record",
    label: "Record",
    items: [
      {
        id: "overview",
        label: "Overview",
        segment: "overview",
        icon: "overview",
        capability: PLATFORM_CAPABILITIES.TENANTS_READ.code,
      },
      {
        id: "apps",
        label: "Apps & entitlements",
        segment: "apps",
        icon: "apps",
        capability: PLATFORM_CAPABILITIES.TENANTS_READ.code,
      },
      {
        id: "quotas",
        label: "Quotas",
        segment: "quotas",
        icon: "quotas",
        capability: PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      },
      {
        id: "activity",
        label: "Activity",
        segment: "activity",
        icon: "activity",
        capability: PLATFORM_CAPABILITIES.TENANTS_READ.code,
      },
    ],
  },
  {
    id: "risky",
    label: "Risky",
    items: [
      {
        id: "support",
        label: "Support session",
        segment: "support",
        icon: "support",
        capability: PLATFORM_CAPABILITIES.IMPERSONATE.code,
      },
      {
        id: "danger",
        label: "Danger zone",
        segment: "danger",
        icon: "danger",
        capability: PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
      },
    ],
  },
];

export function tenantRecordHref(orgId: string, segment: string): string {
  return `${TENANT_RECORD_ROUTE_PREFIX}/${encodeURIComponent(orgId)}/${segment}`;
}

export function tenantRecordItemHref(
  orgId: string,
  item: TenantRecordNavItem
): string {
  return tenantRecordHref(orgId, item.segment);
}

/** Hub routes are /tenants/<id> and every panel below it, never /tenants. */
export function isTenantRecordHubRoute(pathname: string): boolean {
  return /^\/tenants\/[^/]+(?:\/|$)/.test(pathname);
}

export function isTenantRecordHrefActive(
  pathname: string,
  href: string
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Fail-closed visibility: a missing or empty capability list resolves to an
 * empty hub, never an ungated one (H-3.6).
 */
export function visibleTenantRecordGroups(
  capabilities: readonly string[] | undefined | null
): TenantRecordNavGroup[] {
  return TENANT_RECORD_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      hasPlatformCapability(capabilities, item.capability)
    ),
  })).filter((group) => group.items.length > 0);
}
