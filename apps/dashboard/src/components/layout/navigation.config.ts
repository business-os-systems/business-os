import type { NavigationConfig, NavItemConfig } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";

/**
 * Base Navigation Configuration (Platform Core Anchors Only)
 *
 * Contains strictly the universal system anchors present for all tenants.
 * In accordance with Constitution Principle II (Dynamic Entitlement Law) and
 * the Zero Static Data Law, modular apps (e.g. Website Builder, POS, Inventory)
 * MUST NEVER be hardcoded here. They are dynamically resolved at runtime from
 * the tenant's installed applications in PostgreSQL.
 */
export const baseNavigationConfig: NavigationConfig = {
  topItems: [
    {
      id: "home",
      name: "Overview",
      href: "/dashboard",
      icon: "home",
      description: "Executive control overview and modular app launcher",
    },
  ],
  bottomItems: [
    {
      id: "settings",
      name: "Settings",
      href: "/settings/general",
      icon: "settings",
      isBottomPinned: true,
      description: "Organization profile, branches, team members, and roles",
      permission: PERMISSIONS.SETTINGS.READ,
    },
  ],
};

/**
 * Alias for baseline navigation configuration.
 */
export const masterNavigationConfig: NavigationConfig = baseNavigationConfig;

export interface InstalledAppNavInput {
  id: string;
  name: string;
  href: string;
  icon: string;
  badge?: string;
  description?: string;
  permission?: string;
}

/**
 * Dynamically constructs the complete NavigationConfig by combining
 * the universal platform anchors with the tenant's verified installed apps from PostgreSQL.
 */
export function buildNavigationConfig(
  installedApps: readonly InstalledAppNavInput[] = []
): NavigationConfig {
  const dynamicAppItems: NavItemConfig[] = installedApps.map((app) => ({
    id: app.id,
    name: app.name,
    href: app.href,
    icon: app.icon,
    badge: app.badge,
    description: app.description,
    permission: app.permission,
  }));

  return {
    topItems: [...baseNavigationConfig.topItems, ...dynamicAppItems],
    bottomItems: [...baseNavigationConfig.bottomItems],
  };
}
