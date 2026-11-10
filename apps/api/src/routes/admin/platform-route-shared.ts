import type { MiddlewareHandler } from "hono";
import { PLATFORM_ERROR_CODE, STEP_UP_TOKEN_HEADER } from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import {
  createPlatformAnyCapabilityGuard,
  createPlatformCapabilityGuard,
  createPlatformSessionGuard,
  type PlatformAnyCapabilityGuardOptions,
  type PlatformCapabilityGuardOptions,
} from "../../middleware/platform-capability.js";
import {
  getPlatformPrismaClient,
  getPlatformRedis,
} from "../../lib/platform-db.js";
import {
  getControlSessionSecret,
  getControlWebauthnRpId,
} from "../../lib/platform-env.js";

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

/**
 * The raw x-step-up-token header, or null when absent. The header stays
 * optional in the OpenAPI contract so the service answers with the registry
 * code STEP_UP_REQUIRED instead of a generic schema failure.
 */
export function readStepUpToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const value = c.req.header(STEP_UP_TOKEN_HEADER)?.trim();
  return value === undefined || value === "" ? null : value;
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
  createOptions: () => Omit<
    PlatformCapabilityGuardOptions,
    "redis" | "rpID"
  >
): MiddlewareHandler {
  const guard = createLazyGuard(() =>
    createPlatformCapabilityGuard({
      ...createOptions(),
      redis: getPlatformRedis(),
      rpID: getControlWebauthnRpId(),
    })
  );
  return async (c, next) => guard()(c, next);
}

/** Route-safe lazy guard that accepts any one of the listed capabilities. */
export function createLazyDefaultAnyCapabilityGuard(
  createOptions: () => Omit<
    PlatformAnyCapabilityGuardOptions,
    "redis" | "rpID"
  >
): MiddlewareHandler {
  const guard = createLazyGuard(() =>
    createPlatformAnyCapabilityGuard({
      ...createOptions(),
      redis: getPlatformRedis(),
      rpID: getControlWebauthnRpId(),
    })
  );
  return async (c, next) => guard()(c, next);
}

/**
 * Session-only guard for self-service surfaces that need an authenticated
 * operator but no capability. RP binding is enforced by the shared verifier.
 */
export function createLazyDefaultSessionGuard(): MiddlewareHandler {
  const guard = createLazyGuard(() =>
    createPlatformSessionGuard({
      prisma: getPlatformPrismaClient(),
      secret: getControlSessionSecret(),
      rpID: getControlWebauthnRpId(),
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
