import type { PrismaClient } from "@suite/db";
import { cacheManager } from "@suite/redis";
import { extractEffectivePermissions } from "./permissions.js";

/**
 * Resolves user role capability claims with Redis cache-aside (Issue 53).
 */
export async function getUserRolePermissions(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
  branchId?: string | null
): Promise<string[]> {
  const cacheKey = `claims:${userId}:${branchId || "all"}`;
  try {
    const cached = await cacheManager.get<string[]>(organizationId, cacheKey);
    if (Array.isArray(cached)) {
      return cached;
    }
  } catch {
    // Graceful fallback to database query
  }

  const branchRoles = await prisma.userBranchRole.findMany({
    where: {
      userId,
      organizationId,
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const permissions = extractEffectivePermissions(branchRoles ?? [], { branchId });

  try {
    await cacheManager.set(organizationId, cacheKey, permissions, 300); // 5 minute TTL
  } catch {
    // Non-blocking cache write failure
  }

  return permissions;
}

/**
 * Invalidates cached role capability claims for an organization or specific user.
 */
export async function invalidateUserPermissionsCache(
  organizationId: string,
  userId?: string
): Promise<void> {
  try {
    if (userId) {
      await cacheManager.invalidatePattern(organizationId, `claims:${userId}:*`);
    } else {
      await cacheManager.invalidatePattern(organizationId, "claims:*");
    }
  } catch {
    // Non-blocking
  }
}
