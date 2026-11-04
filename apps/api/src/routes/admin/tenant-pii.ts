import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import {
  createSuccessResponseBody,
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  RATE_LIMITS,
} from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import { redis } from "@suite/redis";
import { createPlatformCapabilityGuard } from "../../middleware/platform-capability.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import { readTenantPii } from "../../services/admin/tenant-pii.service.js";
import { envelope, errorResponses } from "./openapi-shared.js";

const PLATFORM_PII_READ = PLATFORM_CAPABILITIES.PII_READ.code;

const tenantPiiMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  membershipStatus: z.string(),
  joinedAt: z.string(),
});

const tenantPiiSchema = z.object({
  tenantId: z.string(),
  members: z.array(tenantPiiMemberSchema),
  checkedAt: z.string(),
});

const tenantParamsSchema = z.object({
  orgId: z.string().trim().min(1).max(128),
});

/**
 * The reason is optional here on purpose: the database is the enforcement point
 * and answers PII_REASON_REQUIRED, so a missing reason maps to the registry
 * code instead of a generic schema failure.
 */
const piiQuerySchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

const readTenantPiiRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}/pii",
  tags: ["Platform Tenants"],
  summary: "Read tenant personal data",
  description:
    "Active member contact data for one tenant. Requires platform:pii:read and a recorded reason; every read is audited by the database. Responses must not be cached.",
  request: { params: tenantParamsSchema, query: piiQuerySchema },
  responses: {
    200: {
      description: "Tenant personal data",
      content: {
        "application/json": { schema: envelope(tenantPiiSchema) },
      },
    },
    ...errorResponses,
  },
});

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

export const tenantPiiRouter = new OpenAPIHono();

tenantPiiRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_PII_READS_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:tenant-pii",
    failureMode: "closed",
  }),
);

tenantPiiRouter.use("*", async (c, next) => {
  const guard = createPlatformCapabilityGuard({
    prisma: getPlatformPrismaClient(),
    redis,
    secret: getControlSessionSecret(),
    capability: PLATFORM_PII_READ,
  });
  await guard(c, next);
});

tenantPiiRouter.openapi(readTenantPiiRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const { reason } = c.req.valid("query");

  const result = await readTenantPii(getPlatformPrismaClient(), {
    organizationId: orgId,
    operatorId: operatorId(c),
    reason: reason ?? "",
    requestId: requestId(c),
  });

  return c.json(
    createSuccessResponseBody({ data: result, requestId: requestId(c) }),
    200,
    { "Cache-Control": "no-store" },
  );
});
