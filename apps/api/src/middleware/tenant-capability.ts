import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { hasPermission, PLATFORM_ERROR_CODE } from "@suite/core";
import { ForbiddenError, UnauthorizedError } from "@suite/core/errors";

const sessionClaimsSchema = z.object({
  permissions: z.array(z.string()).optional(),
});

export interface TenantActor {
  readonly organizationId: string;
  readonly userId: string;
  readonly branchId: string | null;
}

/** The claims are read defensively; a malformed payload is an empty set. */
export function readSessionPermissions(c: { get: (key: string) => unknown }): readonly string[] {
  const parsed = sessionClaimsSchema.safeParse(c.get("user"));
  return parsed.success ? (parsed.data.permissions ?? []) : [];
}

/** Fails closed: a missing or empty permission set denies a gated route. */
export function createTenantCapabilityGuard(permission: string): MiddlewareHandler {
  return async (c, next) => {
    if (!hasPermission(readSessionPermissions(c), permission)) {
      throw new ForbiddenError(
        "This action requires the " + permission + " capability.",
        { code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED }
      );
    }
    await next();
  };
}

/**
 * Fails closed for a capability set with an explicit implication: the actor
 * must hold at least one named capability. An empty set never grants access.
 */
export function createTenantAnyCapabilityGuard(permissions: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const granted = readSessionPermissions(c);
    const allowed = permissions.some((permission) => hasPermission(granted, permission));
    if (permissions.length === 0 || !allowed) {
      throw new ForbiddenError(
        "This action requires one of: " + permissions.join(", ") + ".",
        { code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED }
      );
    }
    await next();
  };
}

/**
 * Tenant identity comes only from the verified session. A session without a
 * workspace or actor cannot reach the CMS routes, so no query or body value can
 * substitute for the boundary.
 */
export function readTenantActor(c: { get: (key: string) => unknown }): TenantActor {
  const organizationId: unknown = c.get("organizationId");
  const userId: unknown = c.get("userId");
  if (
    typeof organizationId !== "string" ||
    organizationId.length === 0 ||
    typeof userId !== "string" ||
    userId.length === 0
  ) {
    throw new UnauthorizedError("An active workspace and an authenticated user are required.", {
      code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    });
  }
  const branchId: unknown = c.get("branchId");
  return {
    organizationId,
    userId,
    branchId: typeof branchId === "string" && branchId.length > 0 ? branchId : null,
  };
}
