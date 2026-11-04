import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import {
  createSuccessResponseBody,
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
} from "@suite/core";
import { OrgStatus } from "@suite/db";
import { redis } from "@suite/redis";
import { createPlatformCapabilityGuard } from "../../middleware/platform-capability.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import { listTenants } from "../../services/admin/tenant.service.js";
import { getTenantRecord } from "../../services/admin/tenant-record.service.js";
import { envelope, errorResponses } from "./openapi-shared.js";

const PLATFORM_TENANTS_READ = PLATFORM_CAPABILITIES.TENANTS_READ.code;

const orgStatusSchema = z.nativeEnum(OrgStatus);

const tenantSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: orgStatusSchema,
  createdAt: z.string(),
  branchCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  installedAppIds: z.array(z.string()),
});

const tenantPageSchema = z.object({
  items: z.array(tenantSummarySchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});

const tenantRecordSchema = z.object({
  profile: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status: orgStatusSchema,
    createdAt: z.string(),
  }),
  counts: z.object({
    branches: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
  }),
  apps: z.array(z.string()),
  quotas: z.array(
    z.object({
      resourceKey: z.string(),
      limitValue: z.string(),
      isEnforced: z.boolean(),
      updatedAt: z.string(),
    })
  ),
  lifecycle: z.array(
    z.object({
      id: z.string(),
      fromStatus: z.string(),
      toStatus: z.string(),
      reason: z.string(),
      actorOperatorId: z.string(),
      occurredAt: z.string(),
    })
  ),
  lifecycleHasMore: z.boolean(),
  recentAudit: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      actorOperatorId: z.string().nullable(),
      occurredAt: z.string(),
    })
  ),
});

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.nativeEnum(OrgStatus).optional(),
  appId: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const tenantParamsSchema = z.object({
  orgId: z.string().trim().min(1).max(128),
});

const listTenantsRoute = createRoute({
  method: "get",
  path: "/tenants",
  tags: ["Platform Tenants"],
  summary: "List tenants",
  description:
    "Cursor-paginated tenant fleet read from the curated overview view. No personal data is returned.",
  request: { query: listQuerySchema },
  responses: {
    200: {
      description: "Tenant page",
      content: {
        "application/json": { schema: envelope(tenantPageSchema) },
      },
    },
    ...errorResponses,
  },
});

const getTenantRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}",
  tags: ["Platform Tenants"],
  summary: "Read one tenant record",
  description:
    "Profile, counts, apps, quotas, lifecycle history and recent platform audit for one tenant.",
  request: { params: tenantParamsSchema },
  responses: {
    200: {
      description: "Tenant record",
      content: {
        "application/json": { schema: envelope(tenantRecordSchema) },
      },
    },
    ...errorResponses,
  },
});

function requestId(c: Context): string {
  const value = c.get("requestId");
  return typeof value === "string" ? value : "unknown";
}

function ok<T>(c: Context, data: T) {
  return c.json(
    createSuccessResponseBody({ data, requestId: requestId(c) }),
    200
  );
}

export const tenantAdminRouter = new OpenAPIHono();

tenantAdminRouter.use(
  "*",
  rateLimitMiddleware({
    limit: 60,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:tenants",
    failureMode: "closed",
  })
);

tenantAdminRouter.use("*", async (c, next) => {
  const guard = createPlatformCapabilityGuard({
    prisma: getPlatformPrismaClient(),
    redis,
    secret: getControlSessionSecret(),
    capability: PLATFORM_TENANTS_READ,
  });
  await guard(c, next);
});

tenantAdminRouter.openapi(listTenantsRoute, async (c) => {
  const query = c.req.valid("query");
  const page = await listTenants(getPlatformPrismaClient(), query);
  return ok(c, page);
});

tenantAdminRouter.openapi(getTenantRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const record = await getTenantRecord(getPlatformPrismaClient(), orgId);
  return ok(c, record);
});
