import { prisma } from "@suite/db";
import { getUserRolePermissions } from "@suite/auth";
import { PERMISSIONS, hasPermission } from "@suite/core";

/**
 * The session claim fields needed to resolve a caller's effective capabilities.
 * The organization id is required because every tenant read is scoped by it.
 */
export interface PermissionSession {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissions?: readonly string[];
  readonly activeBranchId?: string;
}

function hasResolvedClaims(permissions: readonly string[]): boolean {
  if (permissions.length === 0) {
    return false;
  }
  return (
    hasPermission(permissions, PERMISSIONS.CORE.ORGANIZATION_READ) ||
    hasPermission(permissions, PERMISSIONS.WILDCARD)
  );
}

/**
 * Resolves a caller's capabilities. Session claims are authoritative; the
 * database is consulted only when the token predates the effective-claims
 * enrichment, exactly as the dashboard shell already did.
 */
export async function resolveEffectivePermissions(
  session: PermissionSession
): Promise<readonly string[]> {
  const sessionPermissions = session.permissions ?? [];
  if (hasResolvedClaims(sessionPermissions)) {
    return sessionPermissions;
  }

  const databasePermissions = await getUserRolePermissions(
    prisma,
    session.userId,
    session.organizationId,
    session.activeBranchId
  );
  return databasePermissions.length > 0 ? databasePermissions : sessionPermissions;
}
