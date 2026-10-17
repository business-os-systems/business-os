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
    MEMBERS_VIEW: "users:read",
    MEMBERS_INVITE: "users:invite",
    MEMBERS_MANAGE: "users:manage",
    ROLES_VIEW: "core:roles:read",
    ROLES_MANAGE: "core:roles:manage",
  },

  // Team & User Management
  USERS: {
    ALL: "users:*",
    READ: "users:read",
    INVITE: "users:invite",
    MANAGE: "users:manage",
  },

  // Subscription & Billing Governance
  BILLING: {
    ALL: "billing:*",
    READ: "billing:read",
    MANAGE: "billing:manage",
  },

  // Modular App 01: Lodging PMS
  LODGING_PMS: {
    ALL: "lodging_pms:*",
    PROPERTIES_READ: "lodging_pms:properties:read",
    PROPERTIES_WRITE: "lodging_pms:properties:write",
    UNITS_READ: "lodging_pms:units:read",
    UNITS_WRITE: "lodging_pms:units:write",
    RESERVATIONS_READ: "lodging_pms:reservations:read",
    RESERVATIONS_CREATE: "lodging_pms:reservations:create",
    RESERVATIONS_UPDATE: "lodging_pms:reservations:update",
    RESERVATIONS_CANCEL: "lodging_pms:reservations:cancel",
    FOLIOS_READ: "lodging_pms:folios:read",
    FOLIOS_WRITE: "lodging_pms:folios:write",
    FOLIOS_VOID: "lodging_pms:folios:void",
    NIGHT_AUDIT_RUN: "lodging_pms:night_audit:run",
  },

  // Modular App 02: Restaurant POS
  RESTAURANT_POS: {
    ALL: "restaurant_pos:*",
    TABLES_READ: "restaurant_pos:tables:read",
    TABLES_MANAGE: "restaurant_pos:tables:manage",
    MENU_READ: "restaurant_pos:menu:read",
    MENU_WRITE: "restaurant_pos:menu:write",
    ORDERS_CREATE: "restaurant_pos:orders:create",
    ORDERS_UPDATE: "restaurant_pos:orders:update",
    ORDERS_VOID: "restaurant_pos:orders:void",
    PAYMENTS_PROCESS: "restaurant_pos:payments:process",
    SHIFTS_MANAGE: "restaurant_pos:shifts:manage",
  },

  // Modular App 03: Stock & Inventory
  STOCK_INVENTORY: {
    ALL: "stock_inventory:*",
    ITEMS_READ: "stock_inventory:items:read",
    ITEMS_WRITE: "stock_inventory:items:write",
    TRANSFERS_CREATE: "stock_inventory:transfers:create",
    COUNTS_MANAGE: "stock_inventory:counts:manage",
  },
} as const;

export type PermissionCode =
  | (typeof PERMISSIONS)["WILDCARD"]
  | (typeof PERMISSIONS.CORE)[keyof typeof PERMISSIONS.CORE]
  | (typeof PERMISSIONS.APPS)[keyof typeof PERMISSIONS.APPS]
  | (typeof PERMISSIONS.SETTINGS)[keyof typeof PERMISSIONS.SETTINGS]
  | (typeof PERMISSIONS.USERS)[keyof typeof PERMISSIONS.USERS]
  | (typeof PERMISSIONS.BILLING)[keyof typeof PERMISSIONS.BILLING]
  | (typeof PERMISSIONS.LODGING_PMS)[keyof typeof PERMISSIONS.LODGING_PMS]
  | (typeof PERMISSIONS.RESTAURANT_POS)[keyof typeof PERMISSIONS.RESTAURANT_POS]
  | (typeof PERMISSIONS.STOCK_INVENTORY)[keyof typeof PERMISSIONS.STOCK_INVENTORY];

export const SETTINGS_PERMISSIONS = PERMISSIONS.SETTINGS;
export type SettingsPermissionCode =
  (typeof SETTINGS_PERMISSIONS)[keyof typeof SETTINGS_PERMISSIONS];
