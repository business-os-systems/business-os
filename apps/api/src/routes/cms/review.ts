import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { MediaAssetMapSchema } from "@suite/website-builder/ast";
import {
  createTenantAnyCapabilityGuard,
  createTenantCapabilityGuard,
  readSessionPermissions,
  readTenantActor,
} from "../../middleware/tenant-capability.js";
import {
  publishBodySchema,
  reviewPageParamsSchema,
  reviewParamsSchema,
  siteParamsSchema,
} from "../../services/cms/contract.js";
import {
  getReview,
  markReviewPageOpened,
  openReview,
  type ReviewSummary,
} from "../../services/cms/review-service.js";
import { publishSite } from "../../services/cms/publish-service.js";
import { REVIEW_ACTION_IDS } from "../../services/cms/review-state.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
  readIdempotencyKey,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const REVIEW_ACTIONS = [
  {
    id: REVIEW_ACTION_IDS.PUBLISH,
    label: "Publish live",
    capability: PERMISSIONS.WEBSITE_BUILDER.PUBLISH,
  },
] as const;

const reviewPageSchema = z
  .object({
    pageId: z.string(),
    title: z.string(),
    path: z.string(),
    orderIndex: z.number().int(),
    status: z.string(),
    revision: z.number().int(),
    contentUpdatedAt: z.string().nullable(),
    changed: z.boolean(),
    reviewed: z.boolean(),
    stale: z.boolean(),
    draftAst: z.unknown(),
    publishedAst: z.unknown().nullable(),
  })
  .strict();

const reviewStatusSchema = z.enum(["OPEN", "READY", "STALE", "PUBLISHED"]);

const reviewSchema = z
  .object({
    reviewId: z.string(),
    siteId: z.string(),
    status: reviewStatusSchema,
    createdAt: z.string(),
    reviewerUserId: z.string(),
    publishedAt: z.string().nullable(),
    changedPageCount: z.number().int(),
    reviewedPageCount: z.number().int(),
    pages: z.array(reviewPageSchema),
    media: MediaAssetMapSchema,
  })
  .strict();

const reviewActionSchema = z
  .object({ id: z.string(), label: z.string() })
  .strict();

const reviewResultSchema = z
  .object({
    review: reviewSchema,
    canPublish: z.boolean(),
    actions: z.array(reviewActionSchema),
  })
  .strict();

const openedResultSchema = z
  .object({
    pageId: z.string(),
    revision: z.number().int(),
    reviewed: z.boolean(),
    stale: z.boolean(),
  })
  .strict();

const publishedPageSchema = z
  .object({
    pageId: z.string(),
    versionNumber: z.number().int(),
    revision: z.number().int(),
  })
  .strict();

const publishResultSchema = z
  .object({
    siteId: z.string(),
    reviewId: z.string(),
    reviewerUserId: z.string(),
    publisherUserId: z.string(),
    publishedAt: z.string(),
    pages: z.array(publishedPageSchema),
    replayed: z.boolean(),
  })
  .strict();

function resolveReviewActions(permissions: readonly string[]) {
  return REVIEW_ACTIONS
    .filter((action) => hasPermission(permissions, action.capability))
    .map((action) => ({ id: action.id, label: action.label }));
}

function canPublish(permissions: readonly string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.WEBSITE_BUILDER.PUBLISH);
}

function toReviewResult(review: ReviewSummary, permissions: readonly string[]) {
  return {
    review,
    canPublish: canPublish(permissions),
    actions: resolveReviewActions(permissions),
  };
}

const openReviewRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/review",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Open a site-wide review session",
  description:
    "Snapshots every page revision so a later publish can prove the preview covered the exact drafts (FR-085, FR-088, FR-091). Publish implies preview (FR-092).",
  request: { params: siteParamsSchema },
  responses: {
    201: {
      description: "Review opened",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(reviewResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [
    createTenantAnyCapabilityGuard([
      PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW,
      PERMISSIONS.WEBSITE_BUILDER.PUBLISH,
    ]),
  ],
});

const getReviewRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}/review/{reviewId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Read a review with draft and live content",
  description:
    "Returns every page with its pending draft, the live AST, whether it changed, whether it has been opened, and whether the review has gone stale (FR-088, FR-089).",
  request: { params: reviewParamsSchema },
  responses: {
    200: {
      description: "Review",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(reviewResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [
    createTenantAnyCapabilityGuard([
      PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW,
      PERMISSIONS.WEBSITE_BUILDER.PUBLISH,
    ]),
  ],
});

const markPageOpenedRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/review/{reviewId}/pages/{pageId}/opened",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Record that a reviewer opened one page",
  description:
    "Review status is informational and never blocks publish (FR-104); a page opened before a later edit no longer counts as reviewed.",
  request: { params: reviewPageParamsSchema },
  responses: {
    200: {
      description: "Page recorded as opened",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(openedResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [
    createTenantAnyCapabilityGuard([
      PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW,
      PERMISSIONS.WEBSITE_BUILDER.PUBLISH,
    ]),
  ],
});

const publishSiteRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/publish",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Publish every changed page in one release",
  description:
    "The only live publish path. Requires a current review, releases all changed pages atomically, snapshots each one and replays the same Idempotency-Key without a second release (FR-030, FR-031, FR-090).",
  request: {
    params: siteParamsSchema,
    headers: z.object({ "Idempotency-Key": z.string().optional() }),
    body: { content: { [CMS_JSON_CONTENT]: { schema: publishBodySchema } } },
  },
  responses: {
    200: {
      description: "Release published",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(publishResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PUBLISH)],
});

const handleOpenReview: RouteHandler<typeof openReviewRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId } = c.req.valid("param");
  const review = await openReview({
    organizationId: actor.organizationId,
    siteId,
    actorUserId: actor.userId,
  });
  return c.json(
    {
      success: true as const,
      data: toReviewResult(review, readSessionPermissions(c)),
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    201
  );
};

const handleGetReview: RouteHandler<typeof getReviewRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId, reviewId } = c.req.valid("param");
  const review = await getReview({
    organizationId: actor.organizationId,
    siteId,
    reviewId,
  });
  return c.json(
    {
      success: true as const,
      data: toReviewResult(review, readSessionPermissions(c)),
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleMarkPageOpened: RouteHandler<typeof markPageOpenedRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId, reviewId, pageId } = c.req.valid("param");
  const result = await markReviewPageOpened({
    organizationId: actor.organizationId,
    siteId,
    reviewId,
    pageId,
    actorUserId: actor.userId,
  });
  return c.json(
    {
      success: true as const,
      data: result,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handlePublishSite: RouteHandler<typeof publishSiteRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await publishSite({
    organizationId: actor.organizationId,
    siteId,
    reviewId: body.reviewId,
    publisherUserId: actor.userId,
    idempotencyKey: readIdempotencyKey(c),
    changeNote: body.changeNote ?? null,
  });
  return c.json(
    {
      success: true as const,
      data: result,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

export function createCmsReviewRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(openReviewRoute, handleOpenReview);
  router.openapi(getReviewRoute, handleGetReview);
  router.openapi(markPageOpenedRoute, handleMarkPageOpened);
  router.openapi(publishSiteRoute, handlePublishSite);
  return router;
}
