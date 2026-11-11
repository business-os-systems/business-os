import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
  createSuccessResponseBody,
  problemDetailsSchema,
} from "@suite/core";
import { createIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import {
  getPlatformPrismaClient,
  getPlatformRedis,
} from "../../lib/platform-db.js";
import {
  siteTakedownBodySchema,
  siteTakedownParamsSchema,
  siteTakedownResultSchema,
  tenantSiteListSchema,
  SITE_TAKEDOWN_ACTIONS,
  type SiteTakedownAction,
  type SiteTakedownResult,
} from "../../services/admin/site-takedown.contract.js";
import {
  listTenantSites,
  restoreSite,
  suspendSite,
} from "../../services/admin/site-takedown.service.js";
import { envelope, errorResponses, stepUpHeaderSchema } from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readStepUpToken,
} from "./platform-route-shared.js";

const PLATFORM_LIFECYCLE = PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code;
const WEBSITE_BUILDER_TAG = "Platform Tenants";

// Mutations are replayable; reads are not. The middleware is attached to the
// two POST routes directly, so a GET never asks for an Idempotency-Key.
const idempotency = createIdempotencyMiddleware({ redis: getPlatformRedis() });

const listSitesRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}/sites",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List a tenant's sites and hosts",
  description:
    "Read-only list for the operator danger page. Every row is scoped to {orgId}; another tenant's site id is never returned (FR-132).",
  request: { params: z.object({ orgId: z.string().trim().min(1).max(128) }) },
  responses: {
    200: {
      description: "Tenant sites",
      content: { "application/json": { schema: envelope(tenantSiteListSchema) } },
    },
    ...errorResponses,
  },
});

const suspendSiteRoute = createRoute({
  method: "post",
  path: "/tenants/{orgId}/sites/{siteId}/suspend",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Suspend a tenant site immediately",
  description:
    "Marks the site SUSPENDED so its hosts stop serving published content. Requires a fresh single-use x-step-up-token and the status the operator observed. The state change, the CMS audit row and the platform audit row commit together (FR-132).",
  request: {
    params: siteTakedownParamsSchema,
    headers: stepUpHeaderSchema,
    body: {
      required: true,
      content: { "application/json": { schema: siteTakedownBodySchema } },
    },
  },
  responses: takedownResponses(),
  middleware: [idempotency],
});

const restoreSiteRoute = createRoute({
  method: "post",
  path: "/tenants/{orgId}/sites/{siteId}/restore",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Restore a suspended tenant site",
  description:
    "Returns the site to the status recorded by its latest suspension. Requires a fresh single-use x-step-up-token and the observed SUSPENDED status (FR-132).",
  request: {
    params: siteTakedownParamsSchema,
    headers: stepUpHeaderSchema,
    body: {
      required: true,
      content: { "application/json": { schema: siteTakedownBodySchema } },
    },
  },
  responses: takedownResponses(),
  middleware: [idempotency],
});

function takedownResponses() {
  return {
    200: {
      description: "Site status changed",
      content: {
        "application/json": { schema: envelope(siteTakedownResultSchema) },
      },
    },
    ...errorResponses,
    409: {
      description: "The site status changed since it was observed",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  } as const;
}

interface SiteChangeCommand {
  readonly organizationId: string;
  readonly siteId: string;
  readonly action: SiteTakedownAction;
  readonly expectedStatus: "DRAFT" | "PUBLISHED" | "MAINTENANCE" | "SUSPENDED" | "ARCHIVED";
  readonly reason: string;
  readonly operatorId: string;
  readonly requestId: string;
  readonly stepUpToken: string | null;
}

async function executeSiteChange(command: SiteChangeCommand): Promise<SiteTakedownResult> {
  const prisma = getPlatformPrismaClient();
  const input = {
    organizationId: command.organizationId,
    siteId: command.siteId,
    expectedStatus: command.expectedStatus,
    reason: command.reason,
    operatorId: command.operatorId,
    requestId: command.requestId,
    stepUpToken: command.stepUpToken,
  };
  if (command.action === SITE_TAKEDOWN_ACTIONS.SUSPEND) {
    return suspendSite(prisma, input);
  }
  return restoreSite(prisma, input);
}

export const siteTakedownRouter = new OpenAPIHono();

siteTakedownRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_LIFECYCLE_MUTATIONS_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:cms-site-takedown",
    failureMode: "closed",
  })
);
siteTakedownRouter.use("*", controlPlaneOriginGuard);

const capabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_LIFECYCLE,
}));
siteTakedownRouter.use("*", capabilityGuard);

siteTakedownRouter.openapi(listSitesRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const { requestId } = readActor(c);
  const items = await listTenantSites(getPlatformPrismaClient(), orgId);
  return c.json(
    createSuccessResponseBody({ data: { items: [...items] }, requestId }),
    200
  );
});

siteTakedownRouter.openapi(suspendSiteRoute, async (c) => {
  const { orgId, siteId } = c.req.valid("param");
  const body = c.req.valid("json");
  const actor = readActor(c);
  const data = await executeSiteChange({
    organizationId: orgId,
    siteId,
    action: SITE_TAKEDOWN_ACTIONS.SUSPEND,
    expectedStatus: body.expectedStatus,
    reason: body.reason,
    operatorId: actor.operatorId,
    requestId: actor.requestId,
    stepUpToken: readStepUpToken(c),
  });
  return c.json(createSuccessResponseBody({ data, requestId: actor.requestId }), 200);
});

siteTakedownRouter.openapi(restoreSiteRoute, async (c) => {
  const { orgId, siteId } = c.req.valid("param");
  const body = c.req.valid("json");
  const actor = readActor(c);
  const data = await executeSiteChange({
    organizationId: orgId,
    siteId,
    action: SITE_TAKEDOWN_ACTIONS.RESTORE,
    expectedStatus: body.expectedStatus,
    reason: body.reason,
    operatorId: actor.operatorId,
    requestId: actor.requestId,
    stepUpToken: readStepUpToken(c),
  });
  return c.json(createSuccessResponseBody({ data, requestId: actor.requestId }), 200);
});
