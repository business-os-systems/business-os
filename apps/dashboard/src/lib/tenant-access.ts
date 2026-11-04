import { prisma } from "@suite/db";
import { normalizeTenantStatus, type TenantStatus } from "@suite/core";

/**
 * Dashboard-side view of a workspace's platform state, cached for sixty
 * seconds so every authenticated route handler can consult it without a
 * database round trip per request (R15, FR-017).
 */
const CACHE_TTL_MS = 60_000;

const statusCache = new Map<
  string,
  { readonly status: TenantStatus | null; readonly expiresAt: number }
>();

export function resetTenantAccessCache(): void {
  statusCache.clear();
}

export async function readDashboardTenantStatus(
  organizationId: string
): Promise<TenantStatus | null> {
  const cached = statusCache.get(organizationId);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.status;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  const status =
    organization === null || organization === undefined
      ? null
      : normalizeTenantStatus(organization.status);

  statusCache.set(organizationId, {
    status,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return status;
}
