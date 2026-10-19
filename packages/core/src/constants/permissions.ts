/**
 * Canonical Application & Domain Permissions Registry (Single Source of Truth)
 *
 * All authorization checks across the platform and modular apps MUST reference
 * these strongly-typed canonical constants. Hardcoding raw string literals is strictly forbidden.
 */

export const PERMISSIONS = {
  // Master Platform Superuser Wildcard
  WILDCARD: "*",

  // Core Platform Administration
  CORE: {
    ALL: "core:*",
    ORGANIZATION_READ: "core:organization:read",
    ORGANIZATION_UPDATE: "core:organization:update",
    BRANCHES_READ: "core:branches:read",
    BRANCHES_WRITE: "core:branches:write",
    USERS_READ: "core:users:read",
    USERS_MANAGE: "core:users:manage",
    ROLES_READ: "core:roles:read",
    ROLES_MANAGE: "core:roles:manage",
    AUDIT_READ: "core:audit:read",
    APPS_MANAGE: "core:apps:manage",
  },

  // Modular Apps Marketplace & Lifecycle
  APPS: {
    ALL: "apps:*",
    READ: "apps:read",
    INSTALL: "apps:install",
    MANAGE: "apps:manage",
    UNINSTALL: "apps:uninstall",
  },

  // Tenant Settings & Governance (Mapped to canonical platform core database actions)
  SETTINGS: {
    ALL: "core:*",
    READ: "core:organization:read",
    MANAGE: "core:organization:update",
    ORGANIZATION_VIEW: "core:organization:read",
    ORGANIZATION_MANAGE: "core:organization:update",
    BRANCHES_VIEW: "core:branches:read",
    BRANCHES_MANAGE: "core:branches:write",
    MEMBERS_VIEW: "core:users:read",
    MEMBERS_INVITE: "core:users:manage",
    MEMBERS_MANAGE: "core:users:manage",
    ROLES_VIEW: "core:roles:read",
    ROLES_MANAGE: "core:roles:manage",
  },

  // Team & User Management
  USERS: {
    ALL: "core:users:*",
    READ: "core:users:read",
    INVITE: "core:users:manage",
    MANAGE: "core:users:manage",
  },

  // Subscription & Billing Governance
  BILLING: {
    ALL: "billing:*",
    READ: "billing:read",
    MANAGE: "billing:manage",
  },

  // Modular App: Website Builder (App 01)
  WEBSITE_BUILDER: {
    ALL: "cms:*",
    SITES_READ: "cms:sites:read",
    SITES_WRITE: "cms:sites:write",
    PAGES_READ: "cms:pages:read",
    PAGES_WRITE: "cms:pages:write",
    PUBLISH: "cms:publish",
  },
} as const;

export type PermissionCode =
  | (typeof PERMISSIONS)["WILDCARD"]
  | (typeof PERMISSIONS.CORE)[keyof typeof PERMISSIONS.CORE]
  | (typeof PERMISSIONS.APPS)[keyof typeof PERMISSIONS.APPS]
  | (typeof PERMISSIONS.SETTINGS)[keyof typeof PERMISSIONS.SETTINGS]
  | (typeof PERMISSIONS.USERS)[keyof typeof PERMISSIONS.USERS]
  | (typeof PERMISSIONS.BILLING)[keyof typeof PERMISSIONS.BILLING]
  | (typeof PERMISSIONS.WEBSITE_BUILDER)[keyof typeof PERMISSIONS.WEBSITE_BUILDER];

export const SETTINGS_PERMISSIONS = PERMISSIONS.SETTINGS;
export type SettingsPermissionCode =
  (typeof SETTINGS_PERMISSIONS)[keyof typeof SETTINGS_PERMISSIONS];

