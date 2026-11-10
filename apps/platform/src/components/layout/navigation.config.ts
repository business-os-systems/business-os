import {
  PLATFORM_APPS_READ_CAPABILITIES,
  PLATFORM_CAPABILITIES,
  type PlatformCapability,
} from "@suite/core";
import { hasPlatformCapability } from "@/lib/capability";
import {
  isAppRecordHubRoute,
  isAppRecordKnownDestination,
} from "./app-record-nav.config";

export type PlatformNavIconKey =
  | "home"
  | "tenants"
  | "apps"
  | "catalogs"
  | "flags"
  | "audit"
  | "operators"
  | "system";

export interface PlatformNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: PlatformNavIconKey;
  /**
   * Any one of these capabilities grants the destination. Most destinations
   * declare a single capability; Applications accepts either its dedicated
   * read capability or the catalog/entitlement management capability that
   * already implied read access before the dedicated capability existed.
   */
  readonly capabilities: readonly PlatformCapability[];
}

export interface PlatformNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly PlatformNavItem[];
}

/**
 * Groups are declared in config, not partitioned in the sidebar (H-3.5).
 * Reading groups first; a destructive group, if ever added, is last (H-3.8).
 */
export const PLATFORM_NAV_GROUPS: readonly PlatformNavGroup[] = [
  {
    id: "operator",
    label: "Operator",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: "/",
        icon: "home",
        capabilities: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code],
      },
      {
        id: "tenants",
        label: "Tenants",
        href: "/tenants",
        icon: "tenants",
        capabilities: [PLATFORM_CAPABILITIES.TENANTS_READ.code],
      },
      {
        id: "apps",
        label: "Applications",
        href: "/apps",
        icon: "apps",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
      {
        id: "catalogs",
        label: "Catalogs",
        href: "/catalogs",
        icon: "catalogs",
        capabilities: [PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code],
      },
      {
        id: "flags",
        label: "Feature flags",
        href: "/flags",
        icon: "flags",
        capabilities: [PLATFORM_CAPABILITIES.FLAGS_MANAGE.code],
      },
      {
        id: "audit",
        label: "Audit",
        href: "/audit",
        icon: "audit",
        capabilities: [PLATFORM_CAPABILITIES.AUDIT_READ.code],
      },
      {
        id: "operators",
        label: "Operators",
        href: "/operators",
        icon: "operators",
        capabilities: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code],
      },
      {
        id: "system",
        label: "System",
        href: "/system",
        icon: "system",
        capabilities: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code],
      },
    ],
  },
];

export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] =
  PLATFORM_NAV_GROUPS.flatMap((group) => group.items);

export function isNavigationHrefActive(
  pathname: string,
  href: string
): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Resolves every capability that can gate a destination. Nested routes inherit
 * the capabilities of their top-level destination; unknown paths return none.
 */
export function requiredCapabilitiesForPath(
  pathname: string
): readonly PlatformCapability[] {
  const item = PLATFORM_NAV_ITEMS.find((navItem) =>
    isNavigationHrefActive(pathname, navItem.href)
  );
  return item?.capabilities ?? [];
}

export function canAccessPath(
  capabilities: readonly PlatformCapability[],
  pathname: string
): boolean {
  if (isAppRecordHubRoute(pathname) && !isAppRecordKnownDestination(pathname)) {
    return false;
  }
  const required = requiredCapabilitiesForPath(pathname);
  return required.some((capability) =>
    hasPlatformCapability(capabilities, capability)
  );
}

export function visibleNavigationGroups(
  capabilities: readonly PlatformCapability[]
): PlatformNavGroup[] {
  return PLATFORM_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.capabilities.some((capability) =>
        hasPlatformCapability(capabilities, capability)
      )
    ),
  })).filter((group) => group.items.length > 0);
}

export function visibleNavigation(
  capabilities: readonly PlatformCapability[]
): PlatformNavItem[] {
  return visibleNavigationGroups(capabilities).flatMap((group) => group.items);
}
