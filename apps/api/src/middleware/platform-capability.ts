import type { MiddlewareHandler } from "hono";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import { PLATFORM_ERROR_CODE, type PlatformCapability } from "@suite/core";
import { ForbiddenError, UnauthorizedError } from "@suite/core/errors";
import { extractTokenFromCookie } from "@suite/auth/session";
import {
  CONTROL_SESSION_COOKIE_NAME,
  resolvePlatformCapabilities,
  verifyAndTouchControlSession,
} from "@suite/auth/platform";

export interface PlatformCapabilityGuardOptions {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly secret: string;
  readonly capability: PlatformCapability;
}

/**
 * Enforces one Platform capability after verifying the control session.
 * The session is touched on success so active operators keep their idle window.
 */
export function createPlatformCapabilityGuard(
  options: PlatformCapabilityGuardOptions
): MiddlewareHandler {
  return async (c, next) => {
    const token = extractTokenFromCookie(
      c.req.header("Cookie"),
      CONTROL_SESSION_COOKIE_NAME
    );
    if (!token) {
      throw new UnauthorizedError("Authentication required.", {
        code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
      });
    }

    const session = await verifyAndTouchControlSession({
      prisma: options.prisma,
      secret: options.secret,
      token,
    });
    if (!session.valid) {
      throw new UnauthorizedError(
        "Control session is invalid or expired.",
        { code: PLATFORM_ERROR_CODE.AUTH_REQUIRED }
      );
    }

    const capabilities = await resolvePlatformCapabilities({
      prisma: options.prisma,
      redis: options.redis,
      operatorId: session.operatorId,
    });
    if (!capabilities.includes(options.capability)) {
      throw new ForbiddenError("Capability denied.", {
        code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      });
    }

    c.set("operatorId", session.operatorId);
    c.set("platformCapabilities", capabilities);
    await next();
  };
}
