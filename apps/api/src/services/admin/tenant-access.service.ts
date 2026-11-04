import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import { normalizeTenantStatus, type TenantStatus } from "@suite/core";
import { logger } from "@suite/logger";

/** A change must reach every tenant request within sixty seconds (FR-017, R15). */
export const TENANT_ACCESS_CACHE_TTL_SECONDS = 60;
export const TENANT_ACCESS_CACHE_PREFIX = "platform:tenant:access";

export interface TenantAccessDeps {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
}

function cacheKey(organizationId: string): string {
  return `${TENANT_ACCESS_CACHE_PREFIX}:${organizationId}`;
}

/**
 * Reads the tenant's status through a sixty-second cache.
 *
 * The cached value is validated before it is trusted: only a canonical status
 * is returned, so a corrupted or foreign cache entry denies rather than
 * allows. A cache outage is logged and skipped rather than turned into an
 * outage of its own; the database remains the authority. An unknown tenant is
 * reported as null and denied by the caller.
 */
export async function readTenantAccessStatus(
  deps: TenantAccessDeps,
  organizationId: string
): Promise<TenantStatus | null> {
  try {
    const cached = await deps.redis.get(cacheKey(organizationId));
    if (cached !== null) {
      const status = normalizeTenantStatus(cached);
      if (status !== null) {
        return status;
      }
      logger.warn(
        { organizationId },
        "Tenant access cache held an unknown status; falling through to the database"
      );
    }
  } catch (error) {
    logger.warn(
      { organizationId, error },
      "Tenant access cache read failed; falling through to the database"
    );
  }

  const organization = await deps.prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  const status = organization === null ? null : normalizeTenantStatus(organization.status);

  if (status !== null) {
    try {
      await deps.redis.set(
        cacheKey(organizationId),
        status,
        "EX",
        TENANT_ACCESS_CACHE_TTL_SECONDS
      );
    } catch (error) {
      logger.warn(
        { organizationId, error },
        "Tenant access cache write failed"
      );
    }
  }

  return status;
}

/**
 * Called from the lifecycle outbox handler so a suspension or restore is
 * enforced immediately rather than at the next cache expiry.
 */
export async function invalidateTenantAccessStatus(
  redis: Redis,
  organizationId: string
): Promise<void> {
  try {
    await redis.del(cacheKey(organizationId));
  } catch (error) {
    logger.warn(
      { organizationId, error },
      "Tenant access cache invalidation failed; the sixty-second expiry still applies"
    );
  }
}
