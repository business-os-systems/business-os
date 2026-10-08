import { ForbiddenError } from "../errors/index.js";

/**
 * Universal platform superuser wildcard granting all permissions across all domains.
 */
export const SUPERUSER_WILDCARD = "*";

/**
 * Checks whether a single user permission string satisfies the required permission pattern.
 * Supports exact matching and hierarchical colon-separated wildcard expansion.
 *
 * Examples:
 * - "*" matches any permission.
 * - "pms:*" matches "pms:reservations:read", "pms:folios:write", etc.
 * - "pms:reservations:*" matches "pms:reservations:read", "pms:reservations:delete".
 * - "pms:reservations:read" matches ONLY "pms:reservations:read".
 */
export function matchPermission(userPerm: string, requiredPerm: string): boolean {
  if (userPerm === SUPERUSER_WILDCARD) {
    return true;
  }

  if (userPerm === requiredPerm) {
    return true;
  }

  // If user permission ends with wildcard (e.g., "pms:*" or "pms:reservations:*")
  if (userPerm.endsWith(":*")) {
    const prefix = userPerm.slice(0, -1); // e.g. "pms:" or "pms:reservations:"
    return requiredPerm.startsWith(prefix);
  }

  // Segment-by-segment hierarchical evaluation
  const userParts = userPerm.split(":");
  const reqParts = requiredPerm.split(":");

  for (let i = 0; i < userParts.length; i++) {
    const userSegment = userParts[i];
    if (userSegment === "*") {
      return true;
    }
    if (userSegment !== reqParts[i]) {
      return false;
    }
  }

  return userParts.length === reqParts.length;
}

/**
 * Evaluates whether a set of user permissions grants the required permission.
 */
export function hasPermission(
  userPermissions: readonly string[],
  requiredPermission: string
): boolean {
  if (!userPermissions || userPermissions.length === 0) {
    return false;
  }

  for (const perm of userPermissions) {
    if (matchPermission(perm, requiredPermission)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a user holds ALL of the specified permissions.
 */
export function hasAllPermissions(
  userPermissions: readonly string[],
  requiredPermissions: readonly string[]
): boolean {
  if (requiredPermissions.length === 0) {
    return true;
  }

  for (const required of requiredPermissions) {
    if (!hasPermission(userPermissions, required)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates whether a user holds AT LEAST ONE of the specified permissions.
 */
export function hasAnyPermission(
  userPermissions: readonly string[],
  requiredPermissions: readonly string[]
): boolean {
  if (requiredPermissions.length === 0) {
    return true;
  }

  for (const required of requiredPermissions) {
    if (hasPermission(userPermissions, required)) {
      return true;
    }
  }

  return false;
}

/**
 * Guard assertion that throws an RFC 7807 ForbiddenError if the required permission is missing.
 */
export function requirePermission(
  userPermissions: readonly string[],
  requiredPermission: string,
  customDetail?: string
): void {
  if (!hasPermission(userPermissions, requiredPermission)) {
    throw new ForbiddenError(
      customDetail ||
        `Access denied. Required permission: '${requiredPermission}' is missing from user claims.`
    );
  }
}

/**
 * Security Context identifying user tenancy and branch role assignments.
 */
export interface UserSecurityContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly isSystemAdmin?: boolean;
  readonly organizationRoles?: readonly string[];
  readonly branchRoles?: Readonly<Record<string, readonly string[]>>;
  readonly directPermissions?: readonly string[];
}

/**
 * Registry mapping role slugs to their authorized permission codes.
 */
export type RolePermissionMapping = Readonly<Record<string, readonly string[]>>;

/**
 * Resolves the aggregated set of active permissions for a user within a target branch.
 */
export function resolveBranchPermissions(
  context: UserSecurityContext,
  targetBranchId?: string,
  rolePermissions: RolePermissionMapping = {}
): readonly string[] {
  // 1. System administrators receive master superuser permission
  if (context.isSystemAdmin) {
    return [SUPERUSER_WILDCARD];
  }

  const permissions = new Set<string>(context.directPermissions ?? []);

  // 2. Organization-level roles (e.g. ORG_OWNER, ORG_ADMIN) apply across all branches
  if (context.organizationRoles) {
    for (const role of context.organizationRoles) {
      if (role === "SYSTEM_ADMIN" || role === "ORG_OWNER") {
        return [SUPERUSER_WILDCARD];
      }
      const rolePerms = rolePermissions[role];
      if (rolePerms) {
        for (const p of rolePerms) permissions.add(p);
      }
    }
  }

  // 3. Branch-scoped roles if a specific targetBranchId is requested
  if (targetBranchId && context.branchRoles && context.branchRoles[targetBranchId]) {
    const rolesForBranch = context.branchRoles[targetBranchId];
    if (rolesForBranch) {
      for (const role of rolesForBranch) {
        if (role === "BRANCH_MANAGER") {
          permissions.add("*"); // Manager holds wildcard within this branch
        }
        const rolePerms = rolePermissions[role];
        if (rolePerms) {
          for (const p of rolePerms) permissions.add(p);
        }
      }
    }
  }

  return Array.from(permissions);
}

/**
 * Evaluates whether a user has permission to perform an operation within a target branch.
 */
export function evaluateBranchAccess(
  context: UserSecurityContext,
  targetBranchId: string,
  requiredPermission: string,
  rolePermissions: RolePermissionMapping = {}
): boolean {
  const activePermissions = resolveBranchPermissions(
    context,
    targetBranchId,
    rolePermissions
  );

  return hasPermission(activePermissions, requiredPermission);
}
