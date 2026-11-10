import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import {
  PLATFORM_APPS_READ_CAPABILITIES,
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
  createSuccessResponseBody,
  problemDetailsSchema,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { createMutationIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  getAppSettingsDefaults,
  updateAppSettingsDefaults,
} from "../../services/admin/app-settings-defaults.service.js";
import {
  appSettingsDefaultsParamsSchema,
  appSettingsDefaultsViewSchema,
  appSettingsDefaultsWriteResultSchema,
  updateAppSettingsDefaultsBodySchema,
} from "../../services/admin/app-settings-defaults.contract.js";
import {
  envelope,
  errorResponses,
  platformValidationHook,
} from "./openapi-shared.js";
import {
  createLazyDefaultAnyCapabilityGuard,
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const APPS_AUTHOR = PLATFORM_CAPABILITIES.APPS_AUTHOR.code;
const SETTINGS_TAG = "Platform App Settings";
export const APP_SETTINGS_READ_RATE_LIMIT_KEY = "rl:admin:app-settings:read";
export const APP_SETTINGS_WRITE_RATE_LIMIT_KEY = "rl:admin:app-settings";

const conflictResponse = {
  description: "Application defaults version conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const settingsErrors = {
  ...errorResponses,
  404: {
    description: "Application or setting not found",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  409: conflictResponse,
} as const;

const getDefaultsRoute = createRoute({
  method: "get",
  path: "/{appId}/settings",
  tags: [SETTINGS_TAG],
  summary: "Read an application's settings defaults",
  description:
    "Returns the compiled field schema, the stored application defaults, the effective values with their source, and any stored fields that no longer validate. Unknown keys are rejected by the compiled schema.",
  request: { params: appSettingsDefaultsParamsSchema },
  responses: {
    200: {
      description: "Application settings defaults",
      content: {
        "application/json": { schema: envelope(appSettingsDefaultsViewSchema) },
      },
    },
    ...settingsErrors,
  },
});

const updateDefaultsRoute = createRoute({
  method: "patch",
  path: "/{appId}/settings",
  tags: [SETTINGS_TAG],
  summary: "Replace an application's settings defaults",
  description:
    "Validates the payload against the compiled schema, rejects unknown keys, and writes the replacement with a version guard. The audit row is written in the same transaction.",
  request: {
    params: appSettingsDefaultsParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: updateAppSettingsDefaultsBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application settings defaults after the change",
      content: {
        "application/json": {
          schema: envelope(appSettingsDefaultsWriteResultSchema),
        },
      },
    },
    ...settingsErrors,
  },
});

export const platformAppSettingsRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const readLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_APP_SETTINGS_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: APP_SETTINGS_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const writeLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_APP_SETTINGS_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: APP_SETTINGS_WRITE_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["PATCH"],
});

const readGuard = createLazyDefaultAnyCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capabilities: PLATFORM_APPS_READ_CAPABILITIES,
}));

const writeGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: APPS_AUTHOR,
}));

const idempotency = createMutationIdempotencyMiddleware();

const readMiddleware: MiddlewareHandler[] = [
  readLimiter,
  controlPlaneOriginGuard,
  readGuard,
];

const writeMiddleware: MiddlewareHandler[] = [
  writeLimiter,
  controlPlaneOriginGuard,
  writeGuard,
  idempotency,
];

platformAppSettingsRouter.openapi(
  { ...getDefaultsRoute, middleware: readMiddleware },
  async (c) => {
    const { appId } = c.req.valid("param");
    const data = await getAppSettingsDefaults(getPlatformPrismaClient(), appId);
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200,
    );
  },
);

platformAppSettingsRouter.openapi(
  { ...updateDefaultsRoute, middleware: writeMiddleware },
  async (c) => {
    const { appId } = c.req.valid("param");
    const body = c.req.valid("json");
    const actor = readActor(c);
    const data = await updateAppSettingsDefaults(getPlatformPrismaClient(), {
      appId,
      values: body.values,
      expectedVersion: body.expectedVersion,
      operatorId: actor.operatorId,
      requestId: actor.requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200,
    );
  },
);
