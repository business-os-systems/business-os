export interface NavigationItem {
  id: string;
  name: string;
  href: string;
  icon: string;
  badge?: string;
  description?: string;
}

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  activeBranchId?: string;
  activeBranchName?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  userInitials?: string;
}
