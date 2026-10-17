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
 * Operator Identity segment (ISP & SRP).
 * Strictly enforces mandatory presence of user credentials and permissions for active sessions.
 */
export interface OperatorIdentityContext {
  userName: string;
  userEmail: string;
  userEmailVerified: boolean;
  userPermissions: readonly string[];
  userRole?: string;
  userInitials?: string;
}

/**
 * Backward compatibility alias during progressive migration.
 */
export type TenantUserProfile = OperatorIdentityContext;

/**
 * Composite Tenant context for workspace navigation shell.
 */
export interface TenantContext
  extends TenantOrganizationContext,
    TenantBranchContext,
    OperatorIdentityContext {}
