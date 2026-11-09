import type { SettingsCategoryConfig, SettingsGroupConfig } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";

/**
 * Declarative Settings Groups Configuration Schema
 *
 * Defines settings vertical groups, section titles, route paths, icons,
 * descriptions, and granular RBAC capability requirements.
 *
 * Strict Compliance:
 * - Pure TypeScript module (NO "use client" directive)
 * - Zero hardcoded string permissions (references canonical PERMISSIONS)
 * - Zero runtime heuristic array partitioning (declared statically in groups)
 */
export const settingsGroupsConfig: SettingsGroupConfig[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        id: "general",
        label: "General",
        description: "Organization legal profile, primary currency, and statutory jurisdiction",
        href: "/settings/general",
        icon: "building",
        permission: PERMISSIONS.SETTINGS.ORGANIZATION_VIEW,
      },
      {
        id: "branches",
        label: "Branches",
        description: "Operational facilities, homestays, outlets, and physical sites",
        href: "/settings/branches",
        icon: "branches",
        permission: PERMISSIONS.SETTINGS.BRANCHES_VIEW,
      },
      {
        id: "addresses",
        label: "Addresses",
        description: "Operational facilities, postal directory, and geospatial map coordinates",
        href: "/settings/addresses",
        icon: "addresses",
        permission: PERMISSIONS.SETTINGS.ORGANIZATION_VIEW,
      },
    ],
  },
  {
    id: "access",
    label: "Access & Security",
    items: [
      {
        id: "members",
        label: "Members",
        description: "Active team directory, multi-channel invitations, and user access",
        href: "/settings/members",
        icon: "users",
        permission: PERMISSIONS.SETTINGS.MEMBERS_VIEW,
      },
      {
        id: "roles",
        label: "Roles & Permissions",
        description: "Access control policies, custom roles catalog, and capabilities matrix",
        href: "/settings/roles",
        icon: "shield",
        permission: PERMISSIONS.SETTINGS.ROLES_VIEW,
      },
      {
        id: "security",
        label: "Security",
        description: "Support-session history and read-only operator access to this workspace",
        href: "/settings/security",
        icon: "shield",
        permission: PERMISSIONS.SETTINGS.ORGANIZATION_VIEW,
      },
    ],
  },
];

export const settingsCategoriesConfig: SettingsCategoryConfig[] =
  settingsGroupsConfig.flatMap((group) => group.items);

export const SETTINGS_HUB_ROOT = "/settings";

/**
 * Declaratively determines if a given pathname belongs to the Core Settings Hub.
 */
export function isSettingsHubRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === SETTINGS_HUB_ROOT || pathname.startsWith(`${SETTINGS_HUB_ROOT}/`);
}
