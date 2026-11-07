import { tenantWriteQuotaGuard, type QuotaGuard } from "@suite/db";

/**
 * API-facing name for the shared tenant-write quota guard. The allowlist and
 * the SECURITY DEFINER primitive live in @suite/db so the API, the dashboard
 * and the module services compose the same adapter (one seam, one policy).
 */
export const tenantQuotaGuard: QuotaGuard = tenantWriteQuotaGuard;
