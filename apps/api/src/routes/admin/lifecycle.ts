import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  RATE_LIMITS,
  TENANT_LIFECYCLE_ACTION,
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
  TENANT_STATUSES,
  createSuccessResponseBody,
  type TenantLifecycleAction,
  type TenantStatus,
} from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import { createIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import {
  getPlatformPrismaClient,
  getPlatformRedis,
} from "../../lib/platform-db.js";
import {
  changeTenantStatus,
  type TenantLifecycleResult,
} from "../../services/admin/lifecycle.service.js";
import { problemDetailsSchema } from "@suite/core";
import { envelope, errorResponses } from "./openapi-shared.js";
import { createLazyDefaultCapabilityGuard } from "./platform-route-shared.js";

const PLATFORM_LIFECYCLE = PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code;

const tenantParamsSchema = z.object({
  orgId: z.string().trim().min(1).max(128),
});

const lifecycleBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(TENANT_LIFECYCLE_REASON_MIN_LENGTH)
      .max(TENANT_LIFECYCLE_REASON_MAX_LENGTH),
    expectedStatus: z.enum(TENANT_STATUSES),
  })
  .strict();

const archiveBodySchema = lifecycleBodySchema
  .extend({ confirmSlug: z.string().trim().min(1).max(191) })
  .strict();

const lifecycleResultSchema = z.object({
  lifecycleEventId: z.string(),
  fromStatus: z.enum(TENANT_STATUSES),
  toStatus: z.enum(TENANT_STATUSES),
  occurredAt: z.string(),
});

interface LifecycleRouteDefinition {
  readonly summary: string;
  readonly description: string;
  readonly bodySchema: typeof lifecycleBodySchema | typeof archiveBodySchema;
}

const LIFECYCLE_ROUTE_DEFINITIONS: Record<
  TenantLifecycleAction,
  LifecycleRouteDefinition
> = {
  SUSPEND: {
    summary: "Suspend a tenant",
    description:
      "Blocks tenant sign-in and every tenant request within sixty seconds. Requires the status the operator observed; a stale status is a conflict, never an overwrite.",
    bodySchema: lifecycleBodySchema,
  },
  RESTORE: {
    summary: "Restore a suspended tenant",
    description:
      "Returns the tenant to the status recorded before the suspension and notifies its administrators.",
    bodySchema: lifecycleBodySchema,
  },
  ARCHIVE: {
    summary: "Archive a tenant",
    description:
      "Makes tenant data inaccessible to the tenant while retaining it. The operator must retype the tenant slug.",
    bodySchema: archiveBodySchema,
  },
};

function requestId(c: Context): string {
  const value = c.get("requestId");
  return typeof value === "string" ? value : "unknown";
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

interface LifecycleBody {
  readonly reason: string;
  readonly expectedStatus: TenantStatus;
  readonly confirmSlug?: string;
}

interface LifecycleChangeRequest {
  readonly organizationId: string;
  readonly action: TenantLifecycleAction;
  readonly body: LifecycleBody;
  readonly operatorId: string;
  readonly requestId: string;
}

async function executeLifecycleChange(
  request: LifecycleChangeRequest
): Promise<TenantLifecycleResult> {
  return changeTenantStatus(getPlatformPrismaClient(), {
    organizationId: request.organizationId,
    action: request.action,
    expectedStatus: request.body.expectedStatus,
    reason: request.body.reason,
    operatorId: request.operatorId,
    requestId: request.requestId,
    ...(request.body.confirmSlug === undefined
      ? {}
      : { confirmationSlug: request.body.confirmSlug }),
  });
}

function lifecycleRequest(bodySchema: typeof lifecycleBodySchema | typeof archiveBodySchema) {
  return {
    params: tenantParamsSchema,
    body: {
      required: true as const,
      content: {
        "application/json": { schema: bodySchema },
      },
    },
  };
}

const lifecycleResponses = {
  200: {
    description: "Lifecycle change applied",
    content: {
      "application/json": { schema: envelope(lifecycleResultSchema) },
    },
  },
  ...errorResponses,
  409: {
    description: "Lifecycle conflict",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const suspendRoute = createRoute({
  method: "post",
  path: "/tenants/{orgId}/suspend",
  tags: ["Platform Tenants"],
  summary: LIFECYCLE_ROUTE_DEFINITIONS.SUSPEND.summary,
  description: LIFECYCLE_ROUTE_DEFINITIONS.SUSPEND.description,
  request: lifecycleRequest(LIFECYCLE_ROUTE_DEFINITIONS.SUSPEND.bodySchema),
  responses: lifecycleResponses,
});

const restoreRoute = createRoute({
  method: "post",
  path: "/tenants/{orgId}/restore",
  tags: ["Platform Tenants"],
  summary: LIFECYCLE_ROUTE_DEFINITIONS.RESTORE.summary,
  description: LIFECYCLE_ROUTE_DEFINITIONS.RESTORE.description,
  request: lifecycleRequest(LIFECYCLE_ROUTE_DEFINITIONS.RESTORE.bodySchema),
  responses: lifecycleResponses,
});

const archiveRoute = createRoute({
  method: "post",
  path: "/tenants/{orgId}/archive",
  tags: ["Platform Tenants"],
  summary: LIFECYCLE_ROUTE_DEFINITIONS.ARCHIVE.summary,
  description: LIFECYCLE_ROUTE_DEFINITIONS.ARCHIVE.description,
  request: lifecycleRequest(LIFECYCLE_ROUTE_DEFINITIONS.ARCHIVE.bodySchema),
  responses: lifecycleResponses,
});

export const tenantLifecycleRouter = new OpenAPIHono();

tenantLifecycleRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_LIFECYCLE_MUTATIONS_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:tenant-lifecycle",
    failureMode: "closed",
  })
);

const lifecycleCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_LIFECYCLE,
}));

tenantLifecycleRouter.use("*", lifecycleCapabilityGuard);

tenantLifecycleRouter.use(
  "*",
  createIdempotencyMiddleware({ redis: getPlatformRedis() })
);

tenantLifecycleRouter.openapi(suspendRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const data = await executeLifecycleChange({
    organizationId: orgId,
    action: TENANT_LIFECYCLE_ACTION.SUSPEND,
    body: c.req.valid("json"),
    operatorId: operatorId(c),
    requestId: requestId(c),
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: requestId(c) }),
    200
  );
});

tenantLifecycleRouter.openapi(restoreRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const data = await executeLifecycleChange({
    organizationId: orgId,
    action: TENANT_LIFECYCLE_ACTION.RESTORE,
    body: c.req.valid("json"),
    operatorId: operatorId(c),
    requestId: requestId(c),
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: requestId(c) }),
    200
  );
});

tenantLifecycleRouter.openapi(archiveRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const data = await executeLifecycleChange({
    organizationId: orgId,
    action: TENANT_LIFECYCLE_ACTION.ARCHIVE,
    body: c.req.valid("json"),
    operatorId: operatorId(c),
    requestId: requestId(c),
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: requestId(c) }),
    200
  );
});