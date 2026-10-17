import type { SettingsCategoryConfig } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";

/**
 * Settings Categories Hub Configuration Schema
 *
 * Defines the 4 primary vertical settings tabs, route paths, icons,
 * descriptions, and granular RBAC capability requirements.
 *
 * Strict Compliance:
 * - Pure TypeScript module (NO "use client" directive)
 * - Zero hardcoded string permissions (references canonical PERMISSIONS)
 * - Pure capability-based authorization gates
 */
export const settingsCategoriesConfig: SettingsCategoryConfig[] = [
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
    icon: "map-pin",
    permission: PERMISSIONS.SETTINGS.BRANCHES_VIEW,
  },
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
];
