import type { MiddlewareHandler } from "hono";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import { PLATFORM_ERROR_CODE, TENANT_STATUS, type TenantStatus } from "@suite/core";
import { ForbiddenError, NotFoundError } from "@suite/core/errors";
import { readTenantAccessStatus } from "../services/admin/tenant-access.service.js";

export interface TenantAccessGuardOptions {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
}

interface BlockedTenantCopy {
  readonly detail: string;
  readonly code: string;
}

/** One status maps to one refusal; a new blocking status adds one entry. */
const BLOCKED_TENANT_COPY: Readonly<
  Partial<Record<TenantStatus, BlockedTenantCopy>>
> = {
  [TENANT_STATUS.SUSPENDED]: {
    detail: "This workspace is suspended. Contact your platform administrator.",
    code: PLATFORM_ERROR_CODE.TENANT_SUSPENDED,
  },
  [TENANT_STATUS.ARCHIVED]: {
    detail:
      "This workspace is archived and its data is no longer accessible.",
    code: PLATFORM_ERROR_CODE.TENANT_ARCHIVED,
  },
};

/**
 * Blocks tenant-plane requests while the workspace is suspended or archived
 * (FR-017, FR-019). It sits behind requireAuth so it only reads a verified
 * organisation claim, and it uses the sixty-second cache plus the lifecycle
 * event's invalidation so a change is never missed for longer than that (R15).
 *
 * A session without an organisation claim passes through on purpose: first-org
 * provisioning happens before a user has a workspace, and there is no tenant
 * state to enforce. A suspended tenant's session always carries its claim.
 */
export function createTenantAccessGuard(
  options: TenantAccessGuardOptions
): MiddlewareHandler {
  return async (c, next) => {
    const organizationId = c.get("organizationId");
    if (typeof organizationId !== "string" || organizationId.length === 0) {
      await next();
      return;
    }

    const status = await readTenantAccessStatus(options, organizationId);

    if (status === null) {
      throw new NotFoundError("Workspace not found.", {
        code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
      });
    }

    const copy = BLOCKED_TENANT_COPY[status];
    if (copy !== undefined) {
      throw new ForbiddenError(copy.detail, { code: copy.code });
    }

    await next();
  };
}
