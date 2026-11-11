import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import {
  createSuccessResponseBody,
  PLATFORM_APPS_READ_CAPABILITIES,
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
  createCatalogItem,
  forkCatalogItemVersion,
  getAppCatalog,
  getAppCatalogServiceContext,
  getCatalogItem,
  listCatalogItems,
  listCatalogItemVersions,
  previewCatalogItem,
  publishCatalogItem,
  transitionCatalogItem,
  updateAppCatalogOverride,
  updateCatalogItemDraft,
} from "../../services/admin/app-catalog.service.js";
import {
  appCatalogParamsSchema,
  catalogAppSchema,
  catalogItemPageSchema,
  catalogItemParamsSchema,
  catalogItemSchema,
  catalogItemVersionPageSchema,
  catalogListSchema,
  catalogPreviewSchema,
  createCatalogItemBodySchema,
  listCatalogItemsQuerySchema,
  listCatalogItemVersionsQuerySchema,
  publishCatalogItemBodySchema,
  updateAppCatalogBodySchema,
  updateCatalogItemBodySchema,
} from "../../services/admin/app-catalog.contract.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import {
  createLazyDefaultAnyCapabilityGuard,
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_ENTITLEMENTS = PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code;
const PLATFORM_APPS_AUTHOR = PLATFORM_CAPABILITIES.APPS_AUTHOR.code;
const PLATFORM_APPS_PUBLISH = PLATFORM_CAPABILITIES.APPS_PUBLISH.code;
const CATALOG_TAG = "Platform App Catalog";
const WEBSITE_BUILDER_CATALOG_TAG = "Platform Website Builder Catalog";
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
    "The compiled application registry merged with its operational overrides (availability, display order and category). installedCount counts tenant installations. A registry identifier is the only source of truth; an override for an unregistered application is never returned (FR-082, FR-085). Reads require platform:apps:read or platform:entitlements:manage; the override mutation remains platform:entitlements:manage.",
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

const catalogReadCapabilityGuard = createLazyDefaultAnyCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capabilities: PLATFORM_APPS_READ_CAPABILITIES,
}));

const catalogWriteCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_ENTITLEMENTS,
}));

const mutationIdempotency = createMutationIdempotencyMiddleware();

const readMiddleware: MiddlewareHandler[] = [
  catalogReadLimiter,
  controlPlaneOriginGuard,
  catalogReadCapabilityGuard,
];

const writeMiddleware: MiddlewareHandler[] = [
  catalogMutationLimiter,
  controlPlaneOriginGuard,
  catalogWriteCapabilityGuard,
  mutationIdempotency,
];

platformAppCatalogRouter.openapi({ ...listCatalogRoute, middleware: readMiddleware }, async (c) => {
  const data = await getAppCatalog(getPlatformPrismaClient());
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});

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
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

// @adminMount /apps/website-builder
// ==============================================================================
// Website Builder application catalog (P-03, #342)
//
// Base path: /api/v1/admin/apps/website-builder. The router is exported next to
// the app-registry router and mounted separately so the existing /catalog
// endpoints keep their own mount prefix and capability guard.
// ==============================================================================

// Authoring and publishing need to read the item they act on, so both
// capabilities also satisfy the read guard through the shared core list
// (PLATFORM_APPS_READ_CAPABILITIES); the Platform UI uses the same list.

export const WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY = "rl:admin:app-catalog-items";
export const WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY = "rl:admin:app-catalog-items:read";
export const WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY = "rl:admin:app-catalog-items:publish";

const catalogItemNotFoundResponse = {
  description: "Catalog item not found",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const catalogItemConflictResponse = {
  description: "Catalog version, preview or lifecycle conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const catalogItemErrors = {
  ...errorResponses,
  404: catalogItemNotFoundResponse,
  409: catalogItemConflictResponse,
} as const;

const listCatalogItemsRoute = createRoute({
  method: "get",
  path: "/items",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "List catalog items",
  description:
    "Lists sections, templates and themes with a cursor, a hard cap of 100 and a stable updatedAt-then-id sort. Reading requires platform:apps:read; the author and publish capabilities also read so they can act on the item, and platform:entitlements:manage retains read.",
  request: { query: listCatalogItemsQuerySchema },
  responses: {
    200: {
      description: "Catalog item page",
      content: {
        "application/json": { schema: envelope(catalogItemPageSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const createCatalogItemRoute = createRoute({
  method: "post",
  path: "/items",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Create a draft catalog item",
  description:
    "Creates a global draft item. The definition is validated against its kind schema and unknown properties are rejected. Nothing becomes visible to tenants until a previewed version is published. Requires platform:apps:author.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createCatalogItemBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Catalog item created",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const getCatalogItemRoute = createRoute({
  method: "get",
  path: "/items/{id}",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Read a catalog item",
  description:
    "Returns the item, its working definition, lifecycle, current published version and pending draft version. A retired item remains resolvable.",
  request: { params: catalogItemParamsSchema },
  responses: {
    200: {
      description: "Catalog item",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const updateCatalogItemRoute = createRoute({
  method: "patch",
  path: "/items/{id}",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Edit the current draft",
  description:
    "Edits the working draft. Editing an active item opens a new draft version and never mutates published history. The caller sends the concurrency version it observed, so a stale edit is a 409. Any edit invalidates an earlier preview. Requires platform:apps:author.",
  request: {
    params: catalogItemParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateCatalogItemBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Catalog item after the draft edit",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const forkCatalogItemVersionRoute = createRoute({
  method: "post",
  path: "/items/{id}/versions",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Fork a new draft version",
  description:
    "Opens the next draft version from the active one. The call is idempotent while a draft is already open, and a never-published item already owns its first draft. Requires platform:apps:author.",
  request: { params: catalogItemParamsSchema },
  responses: {
    200: {
      description: "Catalog item with the open draft",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const listCatalogItemVersionsRoute = createRoute({
  method: "get",
  path: "/items/{id}/versions",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Read version history",
  description:
    "Returns immutable published snapshots, newest first, with a cursor and a hard cap of 100.",
  request: {
    params: catalogItemParamsSchema,
    query: listCatalogItemVersionsQuerySchema,
  },
  responses: {
    200: {
      description: "Version history page",
      content: {
        "application/json": { schema: envelope(catalogItemVersionPageSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const previewCatalogItemRoute = createRoute({
  method: "post",
  path: "/items/{id}/preview",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Issue a signed preview reference",
  description:
    "Records a completed preview of the current draft and returns a short-lived signed reference. Publishing requires a preview whose definition hash still matches the draft (FR-149). Requires platform:apps:author or platform:apps:publish: FR-092 makes a publish grant imply preview.",
  request: { params: catalogItemParamsSchema },
  responses: {
    200: {
      description: "Signed preview reference",
      content: {
        "application/json": { schema: envelope(catalogPreviewSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const publishCatalogItemRoute = createRoute({
  method: "post",
  path: "/items/{id}/publish",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Publish a catalog version",
  description:
    "Publishes the requested draft version after a completed preview of the same definition. Publishing an already-active version is idempotent; a deprecated or disabled item is republished from its published version. The audit row is written in the same transaction. Requires platform:apps:publish.",
  request: {
    params: catalogItemParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: publishCatalogItemBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Catalog item after publish",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const deprecateCatalogItemRoute = createRoute({
  method: "post",
  path: "/items/{id}/deprecate",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Deprecate a catalog item",
  description:
    "Stops offering the item to new sites while existing content keeps working. Repeating the transition is a no-op. Requires platform:apps:publish.",
  request: { params: catalogItemParamsSchema },
  responses: {
    200: {
      description: "Catalog item after the lifecycle transition",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const disableCatalogItemRoute = createRoute({
  method: "post",
  path: "/items/{id}/disable",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Disable a catalog item",
  description:
    "Hides the item from pickers while keeping it resolvable. Existing tenant content is untouched. Repeating the transition is a no-op. Requires platform:apps:publish.",
  request: { params: catalogItemParamsSchema },
  responses: {
    200: {
      description: "Catalog item after the lifecycle transition",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

const retireCatalogItemRoute = createRoute({
  method: "post",
  path: "/items/{id}/retire",
  tags: [WEBSITE_BUILDER_CATALOG_TAG],
  summary: "Retire a catalog item",
  description:
    "Terminal transition. The row is never deleted and remains resolvable by id and version. Repeating the transition is a no-op. Requires platform:apps:publish.",
  request: { params: catalogItemParamsSchema },
  responses: {
    200: {
      description: "Catalog item after the lifecycle transition",
      content: {
        "application/json": { schema: envelope(catalogItemSchema) },
      },
    },
    ...catalogItemErrors,
  },
});

export const websiteBuilderCatalogRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const websiteBuilderCatalogReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const websiteBuilderCatalogAuthorLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["POST", "PATCH"],
});

const websiteBuilderCatalogPublishLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["POST"],
});

const websiteBuilderCatalogReadGuard = createLazyDefaultAnyCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capabilities: PLATFORM_APPS_READ_CAPABILITIES,
}));

const websiteBuilderCatalogAuthorGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_APPS_AUTHOR,
}));

const websiteBuilderCatalogPublishGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_APPS_PUBLISH,
}));

/**
 * FR-092: anyone permitted to publish must also be permitted to preview.
 * Requiring author-only here would make a publish-only grant invalid, so the
 * preview endpoint accepts either capability and the publish grant implies it.
 */
const websiteBuilderCatalogPreviewGuard = createLazyDefaultAnyCapabilityGuard(() => ({
  capabilities: [PLATFORM_APPS_AUTHOR, PLATFORM_APPS_PUBLISH],
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
}));

const websiteBuilderCatalogIdempotency = createMutationIdempotencyMiddleware();

const websiteBuilderReadMiddleware: MiddlewareHandler[] = [
  websiteBuilderCatalogReadLimiter,
  controlPlaneOriginGuard,
  websiteBuilderCatalogReadGuard,
];

const websiteBuilderAuthorMiddleware: MiddlewareHandler[] = [
  websiteBuilderCatalogAuthorLimiter,
  controlPlaneOriginGuard,
  websiteBuilderCatalogAuthorGuard,
  websiteBuilderCatalogIdempotency,
];

const websiteBuilderPublishMiddleware: MiddlewareHandler[] = [
  websiteBuilderCatalogPublishLimiter,
  controlPlaneOriginGuard,
  websiteBuilderCatalogPublishGuard,
  websiteBuilderCatalogIdempotency,
];

const websiteBuilderPreviewMiddleware: MiddlewareHandler[] = [
  websiteBuilderCatalogAuthorLimiter,
  controlPlaneOriginGuard,
  websiteBuilderCatalogPreviewGuard,
  websiteBuilderCatalogIdempotency,
];

websiteBuilderCatalogRouter.openapi(
  { ...listCatalogItemsRoute, middleware: websiteBuilderReadMiddleware },
  async (c) => {
    const data = await listCatalogItems(getAppCatalogServiceContext(), c.req.valid("query"));
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...createCatalogItemRoute, middleware: websiteBuilderAuthorMiddleware },
  async (c) => {
    const actor = readActor(c);
    const data = await createCatalogItem(getAppCatalogServiceContext(), {
      body: c.req.valid("json"),
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 201);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...getCatalogItemRoute, middleware: websiteBuilderReadMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await getCatalogItem(getAppCatalogServiceContext(), id);
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...updateCatalogItemRoute, middleware: websiteBuilderAuthorMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await updateCatalogItemDraft(getAppCatalogServiceContext(), {
      itemId: id,
      body: c.req.valid("json"),
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  {
    ...forkCatalogItemVersionRoute,
    middleware: websiteBuilderAuthorMiddleware,
  },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await forkCatalogItemVersion(getAppCatalogServiceContext(), {
      itemId: id,
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...listCatalogItemVersionsRoute, middleware: websiteBuilderReadMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await listCatalogItemVersions(getAppCatalogServiceContext(), {
      itemId: id,
      query: c.req.valid("query"),
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...previewCatalogItemRoute, middleware: websiteBuilderPreviewMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await previewCatalogItem(getAppCatalogServiceContext(), {
      itemId: id,
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...publishCatalogItemRoute, middleware: websiteBuilderPublishMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await publishCatalogItem(getAppCatalogServiceContext(), {
      itemId: id,
      body: c.req.valid("json"),
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...deprecateCatalogItemRoute, middleware: websiteBuilderPublishMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await transitionCatalogItem(getAppCatalogServiceContext(), {
      itemId: id,
      action: "deprecate",
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...disableCatalogItemRoute, middleware: websiteBuilderPublishMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await transitionCatalogItem(getAppCatalogServiceContext(), {
      itemId: id,
      action: "disable",
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);

websiteBuilderCatalogRouter.openapi(
  { ...retireCatalogItemRoute, middleware: websiteBuilderPublishMiddleware },
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = readActor(c);
    const data = await transitionCatalogItem(getAppCatalogServiceContext(), {
      itemId: id,
      action: "retire",
      ...actor,
    });
    return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
  },
);
