import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  RATE_LIMITS,
  createSuccessResponseBody,
  problemDetailsSchema,
} from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import { redis } from "@suite/redis";
import { createIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import { createAdminFlagsService } from "../../services/admin/flags.service.js";
import {
  createFlagBodySchema,
  flagEnvironmentQuerySchema,
  flagKeyParamSchema,
  flagPageSchema,
  flagSchema,
  listFlagsQuerySchema,
  updateFlagBodySchema,
} from "./flags.schema.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import {
  createLazyCapabilityGuard,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_FLAGS = PLATFORM_CAPABILITIES.FLAGS_MANAGE.code;

const conflictResponse = {
  description: "Flag conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const listFlagsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Platform Flags"],
  summary: "List feature flags",
  description:
    "Returns every flag, optionally filtered by environment, with its owner, expiry, removal ticket and expiry state.",
  request: { query: listFlagsQuerySchema },
  responses: {
    200: {
      description: "Flag list",
      content: { "application/json": { schema: envelope(flagPageSchema) } },
    },
    ...errorResponses,
  },
});

const createFlagRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Platform Flags"],
  summary: "Create a feature flag",
  description:
    "Creates a flag in the off state. The owner, expiry and removal ticket are mandatory (OP-8); enabling is a separate, audited update.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createFlagBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Flag created",
      content: { "application/json": { schema: envelope(flagSchema) } },
    },
    ...errorResponses,
    404: {
      description: "Flag not found",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
    409: conflictResponse,
  },
});

const updateFlagRoute = createRoute({
  method: "patch",
  path: "/{key}",
  tags: ["Platform Flags"],
  summary: "Update a feature flag",
  description:
    "Applies an optimistic-concurrency update. Enabling requires complete lifecycle metadata and a future expiry; an expired flag is refused.",
  request: {
    params: flagKeyParamSchema,
    query: flagEnvironmentQuerySchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateFlagBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Flag updated",
      content: { "application/json": { schema: envelope(flagSchema) } },
    },
    ...errorResponses,
    404: {
      description: "Flag not found",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
    409: conflictResponse,
  },
});

export const platformFlagsRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

platformFlagsRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_FLAG_REQUESTS_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:flags",
    failureMode: "closed",
  })
);

const flagsCapabilityGuard = createLazyCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  redis,
  secret: getControlSessionSecret(),
  capability: PLATFORM_FLAGS,
}));

platformFlagsRouter.use("*", (c, next) => flagsCapabilityGuard()(c, next));

// The capability guard runs first so the idempotency scope is bound to the
// authenticated operator. GET is a read and must not require a key (CT-4).
const idempotency = createIdempotencyMiddleware({ redis });
platformFlagsRouter.use("*", async (c, next) => {
  if (c.req.method === "GET") {
    return next();
  }
  return idempotency(c, next);
});

let flagsService: ReturnType<typeof createAdminFlagsService> | null = null;

function adminFlags(): ReturnType<typeof createAdminFlagsService> {
  flagsService ??= createAdminFlagsService(getPlatformPrismaClient());
  return flagsService;
}

function operatorId(c: Context): string {
  const value = c.get("operatorId");
  if (typeof value !== "string") {
    throw new UnauthorizedError("Authentication required.", {
      code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    });
  }
  return value;
}

platformFlagsRouter.openapi(listFlagsRoute, async (c) => {
  const { environment, cursor, limit } = c.req.valid("query");
  const data = await adminFlags().listFlags({ environment, cursor, limit });
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});

platformFlagsRouter.openapi(createFlagRoute, async (c) => {
  const data = await adminFlags().createFlag(c.req.valid("json"), {
    operatorId: operatorId(c),
    requestId: readRequestId(c),
  });
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 201);
});

platformFlagsRouter.openapi(updateFlagRoute, async (c) => {
  const { key } = c.req.valid("param");
  const { environment } = c.req.valid("query");
  const data = await adminFlags().updateFlag({
    key,
    environment,
    patch: c.req.valid("json"),
    actor: { operatorId: operatorId(c), requestId: readRequestId(c) },
  });
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});
