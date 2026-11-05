import type { MiddlewareHandler } from "hono";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import {
  createPlatformCapabilityGuard,
  type PlatformCapabilityGuardOptions,
} from "../../middleware/platform-capability.js";
import { getPlatformRedis } from "../../lib/platform-db.js";

/**
 * One lazy guard per router. The options factory runs on the first request so
 * importing the router does not require the Platform environment or a database
 * connection at module load.
 */
function createLazyGuard(
  create: () => MiddlewareHandler
): () => MiddlewareHandler {
  let guard: MiddlewareHandler | null = null;
  return () => {
    guard ??= create();
    return guard;
  };
}

export function createLazyCapabilityGuard(
  createOptions: () => PlatformCapabilityGuardOptions
): () => MiddlewareHandler {
  return createLazyGuard(() => createPlatformCapabilityGuard(createOptions()));
}

export function readRequestId(c: {
  get: (key: string) => unknown;
}): string {
  const value = c.get("requestId");
  return typeof value === "string" ? value : "unknown";
}

/** The authenticated operator plus the request correlation id. */
export function readActor(c: { get: (key: string) => unknown }): {
  readonly operatorId: string;
  readonly requestId: string;
} {
  return { operatorId: readOperatorId(c), requestId: readRequestId(c) };
}

/**
 * Route-safe lazy guard for new routers; transport code never imports Redis.
 */
export function createLazyDefaultCapabilityGuard(
  createOptions: () => Omit<PlatformCapabilityGuardOptions, "redis">
): MiddlewareHandler {
  const guard = createLazyGuard(() =>
    createPlatformCapabilityGuard({
      ...createOptions(),
      redis: getPlatformRedis(),
    })
  );
  return async (c, next) => guard()(c, next);
}

/** The capability guard sets this only after a verified control session. */
function readOperatorId(c: { get: (key: string) => unknown }): string {
  const value = c.get("operatorId");
  if (typeof value !== "string") {
    throw new UnauthorizedError("Authentication required.", {
      code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    });
  }
  return value;
}
