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

export interface PlatformSessionGuardOptions {
  readonly prisma: PrismaClient;
  readonly secret: string;
  /** The RP identity a control session must have been issued under (T182). */
  readonly rpID: string;
}

export interface PlatformCapabilityGuardOptions
  extends PlatformSessionGuardOptions {
  readonly redis: Redis;
  readonly capability: PlatformCapability;
}

interface VerifiedRequestSession {
  readonly operatorId: string;
}

async function requireControlSession(
  c: Parameters<MiddlewareHandler>[0],
  options: PlatformSessionGuardOptions
): Promise<VerifiedRequestSession> {
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
    rpID: options.rpID,
    token,
  });
  if (!session.valid) {
    throw new UnauthorizedError(
      "Control session is invalid or expired.",
      { code: PLATFORM_ERROR_CODE.AUTH_REQUIRED }
    );
  }
  return { operatorId: session.operatorId };
}

/**
 * Authenticates a control session without requiring a capability. Self-service
 * surfaces use this so any ACTIVE operator can act on their own record.
 */
export function createPlatformSessionGuard(
  options: PlatformSessionGuardOptions
): MiddlewareHandler {
  return async (c, next) => {
    const session = await requireControlSession(c, options);
    c.set("operatorId", session.operatorId);
    await next();
  };
}

/**
 * Enforces one Platform capability after verifying the control session.
 * The session is touched on success so active operators keep their idle window.
 */
export function createPlatformCapabilityGuard(
  options: PlatformCapabilityGuardOptions
): MiddlewareHandler {
  return async (c, next) => {
    const session = await requireControlSession(c, options);
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
