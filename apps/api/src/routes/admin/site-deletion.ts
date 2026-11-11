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
import { getPlatformPrismaClient, getPlatformRedis } from "../../lib/platform-db.js";
import {
  deletionFlaggedSiteListSchema,
  siteDeletionConfirmationBodySchema,
  siteDeletionParamsSchema,
  siteDeletionResultSchema,
} from "../../services/admin/site-deletion.contract.js";
import {
  confirmSiteDeletion,
  listDeletionFlaggedSites,
} from "../../services/admin/site-deletion.service.js";
import { envelope, errorResponses, stepUpHeaderSchema } from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readStepUpToken,
} from "./platform-route-shared.js";

const PLATFORM_LIFECYCLE = PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code;
const WEBSITE_BUILDER_TAG = "Platform Tenants";
const SITE_DELETION_RATE_LIMIT_KEY = "rl:admin:cms-site-deletion";

const idempotency = createIdempotencyMiddleware({ redis: getPlatformRedis() });

const listFlaggedSitesRoute = createRoute({
  method: "get",
  path: "/tenants/{orgId}/sites/flagged",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List sites flagged for deletion",
  description:
    "Read-only list of inactive sites the lifecycle job flagged. Nothing is deleted by this read; removal needs an explicit human confirmation naming the site (FR-097).",
  request: { params: z.object({ orgId: z.string().trim().min(1).max(128) }) },
  responses: {
    200: {
      description: "Flagged sites",
      content: {
        "application/json": { schema: envelope(deletionFlaggedSiteListSchema) },
      },
    },
    ...errorResponses,
  },
});

function confirmationResponses() {
  return {
    200: {
      description: "Site content removed after human confirmation",
      content: {
        "application/json": { schema: envelope(siteDeletionResultSchema) },
      },
    },
    ...errorResponses,
    409: {
      description: "The site changed since it was observed",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  } as const;
}

const confirmDeletionRoute = createRoute({
  method: "post",
  path: "/tenants/{orgId}/sites/{siteId}/confirm-deletion",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Confirm removal of a flagged site",
  description:
    "The only path that removes site content. Requires a fresh single-use x-step-up-token, the observed status and the exact site slug. The purge, the site status change and the CMS audit row commit together (FR-097, FR-099).",
  request: {
    params: siteDeletionParamsSchema,
    headers: stepUpHeaderSchema,
    body: {
      required: true,
      content: { "application/json": { schema: siteDeletionConfirmationBodySchema } },
    },
  },
  responses: confirmationResponses(),
  middleware: [idempotency],
});

export const siteDeletionRouter = new OpenAPIHono();

siteDeletionRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_LIFECYCLE_MUTATIONS_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: SITE_DELETION_RATE_LIMIT_KEY,
    failureMode: "closed",
  }),
);
siteDeletionRouter.use("*", controlPlaneOriginGuard);

const capabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_LIFECYCLE,
}));
siteDeletionRouter.use("*", capabilityGuard);

siteDeletionRouter.openapi(listFlaggedSitesRoute, async (c) => {
  const { orgId } = c.req.valid("param");
  const { requestId } = readActor(c);
  const items = await listDeletionFlaggedSites(orgId);
  return c.json(createSuccessResponseBody({ data: { items: [...items] }, requestId }), 200);
});

siteDeletionRouter.openapi(confirmDeletionRoute, async (c) => {
  const { orgId, siteId } = c.req.valid("param");
  const body = c.req.valid("json");
  const actor = readActor(c);
  const data = await confirmSiteDeletion({
    organizationId: orgId,
    siteId,
    body,
    operatorId: actor.operatorId,
    stepUpToken: readStepUpToken(c),
  });
  return c.json(createSuccessResponseBody({ data, requestId: actor.requestId }), 200);
});
