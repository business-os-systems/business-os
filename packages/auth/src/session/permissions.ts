/**
 * Shared Permission Aggregation Primitives (@suite/auth)
 * Flattens and dedupes hierarchical permissions across role assignments.
 */

export interface BranchRoleWithPermissions {
  branchId?: string | null;
  role?: {
    permissions?: Array<{
      permission?: {
        action?: string | null;
      } | null;
    }> | null;
  } | null;
}

export interface PermissionExtractionOptions {
  branchId?: string | null;
}

/**
 * Extracts and deduplicates all granted permission action strings from user branch roles.
 * Optionally filters to organization-wide (branchId == null) and target branch assignments.
 */
export function extractEffectivePermissions(
  branchRoles: readonly BranchRoleWithPermissions[] = [],
  options?: PermissionExtractionOptions
): string[] {

  const targetBranchId = options?.branchId;
  const permissionsSet = new Set<string>();

  for (const br of branchRoles) {
    // If a target branch is specified, include branch matches and org-wide (null) roles
    if (
      targetBranchId === undefined ||
      br.branchId === targetBranchId ||
      br.branchId === null ||
      !targetBranchId
    ) {
      if (br.role?.permissions) {
        for (const rp of br.role.permissions) {
          if (rp.permission?.action) {
            permissionsSet.add(rp.permission.action);
          }
        }
      }
    }
  }

  return Array.from(permissionsSet);
}
