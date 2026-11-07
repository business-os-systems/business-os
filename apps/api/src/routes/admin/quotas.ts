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
  getTenantQuotas,
  setTenantQuotas,
} from "../../services/admin/quota.service.js";
import {
  quotaListSchema,
  tenantParamsSchema,
  updateQuotasBodySchema,
} from "../../services/admin/quota.contract.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_QUOTAS = PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code;
const QUOTAS_TAG = "Platform Quotas";
export const QUOTA_RATE_LIMIT_KEY = "rl:admin:quotas";
export const QUOTA_READ_RATE_LIMIT_KEY = "rl:admin:quotas:read";

const conflictResponse = {
  description: "Quota version conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const quotaErrors = {
  ...errorResponses,
  409: conflictResponse,
};

const listRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}/quotas",
  tags: [QUOTAS_TAG],
  summary: "Read a tenant's quotas and usage",
  description:
    "Configured quotas with their unit, measured consumption, as-of time, enforcement state and concurrency version. An unmeasurable resource reports null consumption rather than zero (FR-091).",
  request: { params: tenantParamsSchema },
  responses: {
    200: {
      description: "Tenant quotas",
      content: { "application/json": { schema: envelope(quotaListSchema) } },
    },
    ...quotaErrors,
  },
});

const updateRoute = createRoute({
  method: "put",
  path: "/tenants/{orgId}/quotas",
  tags: [QUOTAS_TAG],
  summary: "Set tenant quotas",
  description:
    "Upserts one or more quotas in a single transaction. Each item carries the version it observed (null when creating); a stale item is a conflict and the whole batch rolls back. Every changed quota writes an audit row in the same transaction.",
  request: {
    params: tenantParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateQuotasBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Quotas after the change",
      content: { "application/json": { schema: envelope(quotaListSchema) } },
    },
    ...quotaErrors,
  },
});

export const platformQuotasRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const quotaReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_QUOTA_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: QUOTA_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const quotaMutationLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_QUOTA_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: QUOTA_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["PUT"],
});

const quotaCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_QUOTAS,
}));

const mutationIdempotency = createMutationIdempotencyMiddleware();

const readMiddleware: MiddlewareHandler[] = [
  quotaReadLimiter,
  controlPlaneOriginGuard,
  quotaCapabilityGuard,
];

const writeMiddleware: MiddlewareHandler[] = [
  quotaMutationLimiter,
  controlPlaneOriginGuard,
  quotaCapabilityGuard,
  mutationIdempotency,
];

platformQuotasRouter.openapi(
  { ...listRoute, middleware: readMiddleware },
  async (c) => {
    const { orgId } = c.req.valid("param");
    const data = await getTenantQuotas(getPlatformPrismaClient(), orgId);
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);

platformQuotasRouter.openapi(
  { ...updateRoute, middleware: writeMiddleware },
  async (c) => {
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json");
    const actor = readActor(c);
    const data = await setTenantQuotas(getPlatformPrismaClient(), {
      organizationId: orgId,
      items: body.items,
      operatorId: actor.operatorId,
      requestId: actor.requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);
