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
  getTenantEntitlements,
  updateTenantEntitlement,
} from "../../services/admin/entitlement.service.js";
import {
  getAppSettings,
  updateAppSettings,
} from "../../services/admin/app-settings.service.js";
import {
  appSettingsParamsSchema,
  appSettingsViewSchema,
  appSettingsWriteResultSchema,
  entitlementListSchema,
  tenantParamsSchema,
  updateAppSettingsBodySchema,
  updateEntitlementBodySchema,
} from "../../services/admin/entitlement.contract.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_ENTITLEMENTS = PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code;
const ENTITLEMENTS_TAG = "Platform Entitlements";
export const ENTITLEMENT_RATE_LIMIT_KEY = "rl:admin:entitlements";
export const ENTITLEMENT_READ_RATE_LIMIT_KEY = "rl:admin:entitlements:read";

const conflictResponse = {
  description: "Entitlement or settings version conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const entitlementErrors = {
  ...errorResponses,
  409: conflictResponse,
};

const getEntitlementsRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}/entitlements",
  tags: [ENTITLEMENTS_TAG],
  summary: "Read a tenant's app entitlements",
  description:
    "Installed applications with their enabled state, install time, concurrency version and read-only per-branch overrides. No personal data is returned.",
  request: { params: tenantParamsSchema },
  responses: {
    200: {
      description: "Tenant entitlements",
      content: {
        "application/json": { schema: envelope(entitlementListSchema) },
      },
    },
    ...entitlementErrors,
  },
});

const updateEntitlementRoute = createRoute({
  method: "put",
  path: "/tenants/{orgId}/entitlements",
  tags: [ENTITLEMENTS_TAG],
  summary: "Enable or disable an installed app for a tenant",
  description:
    "Toggles an existing installation only; an app the tenant does not have is refused. The caller sends the version it observed, so a stale edit is a conflict rather than an overwrite. The audit row is written in the same transaction. Per-branch overrides are returned read-only by GET and are not mutated by this route.",
  request: {
    params: tenantParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: updateEntitlementBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Entitlements after the change",
      content: {
        "application/json": { schema: envelope(entitlementListSchema) },
      },
    },
    ...entitlementErrors,
  },
});

const getAppSettingsRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}/apps/{appId}/settings",
  tags: [ENTITLEMENTS_TAG],
  summary: "Read a tenant's application settings",
  description:
    "Returns the application's declared field schema, the stored configuration values and any fields that no longer validate against the current schema. Stale values are surfaced, never discarded. Install metadata such as the manifest snapshot and installedBy is not returned.",
  request: { params: appSettingsParamsSchema },
  responses: {
    200: {
      description: "Application settings",
      content: {
        "application/json": { schema: envelope(appSettingsViewSchema) },
      },
    },
    ...entitlementErrors,
  },
});

const updateAppSettingsRoute = createRoute({
  method: "put",
  path: "/tenants/{orgId}/apps/{appId}/settings",
  tags: [ENTITLEMENTS_TAG],
  summary: "Validate and store a tenant's application settings",
  description:
    "Validates the payload against the schema the application declares. An invalid payload is rejected field by field and nothing is stored. The caller sends the version it observed, so a stale edit is a conflict. Install metadata is preserved untouched, and any configuration keys the write removes are reported in removedFields.",
  request: {
    params: appSettingsParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: updateAppSettingsBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Stored application settings",
      content: {
        "application/json": { schema: envelope(appSettingsWriteResultSchema) },
      },
    },
    ...entitlementErrors,
  },
});

export const platformEntitlementsRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const entitlementReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_ENTITLEMENT_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: ENTITLEMENT_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const entitlementMutationLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_ENTITLEMENT_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: ENTITLEMENT_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["PUT"],
});

const entitlementCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_ENTITLEMENTS,
}));

const mutationIdempotency = createMutationIdempotencyMiddleware();

const readMiddleware: MiddlewareHandler[] = [
  entitlementReadLimiter,
  controlPlaneOriginGuard,
  entitlementCapabilityGuard,
];

// The capability guard runs before idempotency so a replay is scoped to the
// authenticated operator; a missing actor fails closed.
const writeMiddleware: MiddlewareHandler[] = [
  entitlementMutationLimiter,
  controlPlaneOriginGuard,
  entitlementCapabilityGuard,
  mutationIdempotency,
];

platformEntitlementsRouter.openapi(
  { ...getEntitlementsRoute, middleware: readMiddleware },
  async (c) => {
    const { orgId } = c.req.valid("param");
    const data = await getTenantEntitlements(getPlatformPrismaClient(), orgId);
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);

platformEntitlementsRouter.openapi(
  { ...updateEntitlementRoute, middleware: writeMiddleware },
  async (c) => {
    const { orgId } = c.req.valid("param");
    const body = c.req.valid("json");
    const actor = readActor(c);
    const data = await updateTenantEntitlement(getPlatformPrismaClient(), {
      organizationId: orgId,
      appId: body.appId,
      enabled: body.enabled,
      expectedVersion: body.expectedVersion,
      operatorId: actor.operatorId,
      requestId: actor.requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);

platformEntitlementsRouter.openapi(
  { ...getAppSettingsRoute, middleware: readMiddleware },
  async (c) => {
    const { orgId, appId } = c.req.valid("param");
    const data = await getAppSettings(getPlatformPrismaClient(), {
      organizationId: orgId,
      appId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);

platformEntitlementsRouter.openapi(
  { ...updateAppSettingsRoute, middleware: writeMiddleware },
  async (c) => {
    const { orgId, appId } = c.req.valid("param");
    const body = c.req.valid("json");
    const actor = readActor(c);
    const data = await updateAppSettings(getPlatformPrismaClient(), {
      organizationId: orgId,
      appId,
      values: body.values,
      expectedVersion: body.expectedVersion,
      operatorId: actor.operatorId,
      requestId: actor.requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: readRequestId(c) }),
      200
    );
  }
);
