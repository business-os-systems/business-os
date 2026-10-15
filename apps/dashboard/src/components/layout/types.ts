export interface NavigationItem {
  id: string;
  name: string;
  href: string;
  icon: string;
  badge?: string;
  description?: string;
}

export const BASE_NAV_ITEMS: NavigationItem[] = [
  {
    id: "home",
    name: "Overview",
    href: "/dashboard",
    icon: "home",
    description: "Executive Business Summary",
  },
];

/**
 * Organization scope segment (ISP).
 */
export interface TenantOrganizationContext {
  organizationId: string;
  organizationName: string;
}

/**
 * Branch execution scope segment (ISP).
 */
export interface TenantBranchContext {
  activeBranchId?: string;
  activeBranchName?: string;
}

/**
 * Active operator identity in navigation shell (ISP).
 */
export interface TenantUserProfile {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  userInitials?: string;
}

/**
 * Composite Tenant context for workspace navigation shell.
 */
export interface TenantContext
  extends TenantOrganizationContext,
    TenantBranchContext,
    TenantUserProfile {}
