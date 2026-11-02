import { PLATFORM_CAPABILITIES, type PlatformCapability } from "@suite/core";

export type PlatformNavIconKey =
  | "home"
  | "tenants"
  | "flags"
  | "audit"
  | "operators"
  | "system";

export const PLATFORM_NAV_GROUPS = [
  { id: "operator", label: "Operator" },
] as const;

export interface PlatformNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: PlatformNavIconKey;
  readonly group: (typeof PLATFORM_NAV_GROUPS)[number]["id"];
  readonly capability: PlatformCapability;
}

export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/",
    icon: "home",
    group: "operator",
    capability: PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  },
  {
    id: "tenants",
    label: "Tenants",
    href: "/tenants",
    icon: "tenants",
    group: "operator",
    capability: PLATFORM_CAPABILITIES.TENANTS_READ.code,
  },
  {
    id: "flags",
    label: "Feature flags",
    href: "/flags",
    icon: "flags",
    group: "operator",
    capability: PLATFORM_CAPABILITIES.FLAGS_MANAGE.code,
  },
  {
    id: "audit",
    label: "Audit",
    href: "/audit",
    icon: "audit",
    group: "operator",
    capability: PLATFORM_CAPABILITIES.AUDIT_READ.code,
  },
  {
    id: "operators",
    label: "Operators",
    href: "/operators",
    icon: "operators",
    group: "operator",
    capability: PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
  },
  {
    id: "system",
    label: "System",
    href: "/system",
    icon: "system",
    group: "operator",
    capability: PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  },
];

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
  return required !== null && capabilities.includes(required);
}

export function visibleNavigation(
  capabilities: readonly PlatformCapability[]
): PlatformNavItem[] {
  const granted = new Set(capabilities);
  return PLATFORM_NAV_ITEMS.filter((item) => granted.has(item.capability));
}
