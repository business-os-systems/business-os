import { PLATFORM_CAPABILITIES, type PlatformCapability } from "@suite/core";
import { hasPlatformCapability } from "@/lib/capability";

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
  readonly capability: PlatformCapability;
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
        capability: PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
      },
      {
        id: "tenants",
        label: "Tenants",
        href: "/tenants",
        icon: "tenants",
        capability: PLATFORM_CAPABILITIES.TENANTS_READ.code,
      },
      {
        id: "apps",
        label: "Applications",
        href: "/apps",
        icon: "apps",
        capability: PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
      },
      {
        id: "catalogs",
        label: "Catalogs",
        href: "/catalogs",
        icon: "catalogs",
        capability: PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code,
      },
      {
        id: "flags",
        label: "Feature flags",
        href: "/flags",
        icon: "flags",
        capability: PLATFORM_CAPABILITIES.FLAGS_MANAGE.code,
      },
      {
        id: "audit",
        label: "Audit",
        href: "/audit",
        icon: "audit",
        capability: PLATFORM_CAPABILITIES.AUDIT_READ.code,
      },
      {
        id: "operators",
        label: "Operators",
        href: "/operators",
        icon: "operators",
        capability: PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
      },
      {
        id: "system",
        label: "System",
        href: "/system",
        icon: "system",
        capability: PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
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
 * Resolves the capability that gates a destination. Nested routes inherit the
 * capability of their top-level destination; unknown paths return null.
 */
export function requiredCapabilityForPath(
  pathname: string
): PlatformCapability | null {
  const item = PLATFORM_NAV_ITEMS.find((navItem) =>
    isNavigationHrefActive(pathname, navItem.href)
  );
  return item?.capability ?? null;
}

export function canAccessPath(
  capabilities: readonly PlatformCapability[],
  pathname: string
): boolean {
  const required = requiredCapabilityForPath(pathname);
  return required !== null && hasPlatformCapability(capabilities, required);
}

export function visibleNavigationGroups(
  capabilities: readonly PlatformCapability[]
): PlatformNavGroup[] {
  const granted = new Set(capabilities);
  return PLATFORM_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => granted.has(item.capability)),
  })).filter((group) => group.items.length > 0);
}

export function visibleNavigation(
  capabilities: readonly PlatformCapability[]
): PlatformNavItem[] {
  return visibleNavigationGroups(capabilities).flatMap((group) => group.items);
}
