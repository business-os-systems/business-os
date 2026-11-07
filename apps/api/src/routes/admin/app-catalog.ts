import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import {
  createSuccessResponseBody,
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
  problemDetailsSchema,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { createMutationIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  getAppCatalog,
  updateAppCatalogOverride,
} from "../../services/admin/app-catalog.service.js";
import {
  appCatalogParamsSchema,
  catalogAppSchema,
  catalogListSchema,
  updateAppCatalogBodySchema,
} from "../../services/admin/app-catalog.contract.js";
import {
  envelope,
  errorResponses,
  platformValidationHook,
} from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_ENTITLEMENTS = PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code;
const CATALOG_TAG = "Platform App Catalog";
export const CATALOG_RATE_LIMIT_KEY = "rl:admin:catalog";
export const CATALOG_READ_RATE_LIMIT_KEY = "rl:admin:catalog:read";

const conflictResponse = {
  description: "Catalog version conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const catalogErrors = {
  ...errorResponses,
  404: {
    description: "Catalog resource not found",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  409: conflictResponse,
} as const;

const listCatalogRoute = createRoute({
  method: "get",
  path: "/",
  tags: [CATALOG_TAG],
  summary: "List the application catalog",
  description:
    "The compiled application registry merged with its operational overrides (availability, display order and category). installedCount counts tenant installations. A registry identifier is the only source of truth; an override for an unregistered application is never returned (FR-082, FR-085).",
  responses: {
    200: {
      description: "Application catalog",
      content: { "application/json": { schema: envelope(catalogListSchema) } },
    },
    ...catalogErrors,
  },
});

const updateCatalogRoute = createRoute({
  method: "patch",
  path: "/{appId}",
  tags: [CATALOG_TAG],
  summary: "Change an application's catalog override",
  description:
    "Updates availability, display order or category without a deployment. Hiding an app never disables it for tenants that already installed it (FR-084). The caller sends the version it observed (null on the first override), so a stale edit is a conflict rather than an overwrite. The audit row is written in the same transaction (FR-086, FR-114).",
  request: {
    params: appCatalogParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateAppCatalogBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Catalog entry after the change",
      content: { "application/json": { schema: envelope(catalogAppSchema) } },
    },
    ...catalogErrors,
  },
});

export const platformAppCatalogRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const catalogReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: CATALOG_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const catalogMutationLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: CATALOG_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["PATCH"],
});

const catalogCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_ENTITLEMENTS,
}));

const mutationIdempotency = createMutationIdempotencyMiddleware();

const readMiddleware: MiddlewareHandler[] = [
  catalogReadLimiter,
  controlPlaneOriginGuard,
  catalogCapabilityGuard,
];

const writeMiddleware: MiddlewareHandler[] = [
  catalogMutationLimiter,
  controlPlaneOriginGuard,
  catalogCapabilityGuard,
  mutationIdempotency,
];

platformAppCatalogRouter.openapi(
  { ...listCatalogRoute, middleware: readMiddleware },
  async (c) => {
    const data = await getAppCatalog(getPlatformPrismaClient());
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);

platformAppCatalogRouter.openapi(
  { ...updateCatalogRoute, middleware: writeMiddleware },
  async (c) => {
    const { appId } = c.req.valid("param");
    const body = c.req.valid("json");
    const actor = readActor(c);
    const data = await updateAppCatalogOverride(getPlatformPrismaClient(), {
      appId,
      change: body,
      operatorId: actor.operatorId,
      requestId: actor.requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);
