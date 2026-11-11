import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import { createTenantCapabilityGuard, readTenantActor } from "../../middleware/tenant-capability.js";
import {
  archivePageBodySchema,
  createPageBodySchema,
  listPagesQuerySchema,
  listRedirectsQuerySchema,
  pageParamsSchema,
  reorderPageBodySchema,
  siteParamsSchema,
  updatePageBodySchema,
} from "../../services/cms/contract.js";
import {
  archivePage,
  createPage,
  deletePage,
  duplicatePage,
  getPage,
  listPages,
  listRedirects,
  reorderPage,
  updatePage,
} from "../../services/cms/page-service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const pageSchema = z
  .object({
    id: z.string(),
    siteId: z.string(),
    parentId: z.string().nullable(),
    title: z.string(),
    path: z.string(),
    orderIndex: z.number().int(),
    status: z.string(),
    isHomePage: z.boolean(),
    revision: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const pageListSchema = z
  .object({ items: z.array(pageSchema), nextCursor: z.string().nullable() })
  .strict();

const redirectSchema = z
  .object({
    id: z.string(),
    siteId: z.string(),
    sourcePath: z.string(),
    targetPath: z.string(),
    type: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict();

const redirectListSchema = z
  .object({ items: z.array(redirectSchema), nextCursor: z.string().nullable() })
  .strict();

const pageResultSchema = z.object({ page: pageSchema }).strict();
const deleteResultSchema = z.object({ deleted: z.literal(true) }).strict();

const listPagesRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}/pages",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List one site's page tree",
  description:
    "Returns the flat, stable-order page list the studio builds its tree from. Another workspace's site id is a 404 (contract cms-admin, CT-5).",
  request: { params: siteParamsSchema, query: listPagesQuerySchema },
  responses: {
    200: {
      description: "Pages",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const listRedirectsRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}/redirects",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List one site's permanent redirects",
  description:
    "Redirects are created when a published page address changes. Cursor-paginated and tenant-scoped; another workspace's site is a 404 (FR-082, CT-5).",
  request: { params: siteParamsSchema, query: listRedirectsQuerySchema },
  responses: {
    200: {
      description: "Redirects",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(redirectListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const createPageRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/pages",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Create a page in the tree",
  description:
    "Normalizes and validates the address, rejects reserved platform paths and guarantees the site keeps exactly one home page (FR-019, FR-021).",
  request: {
    params: siteParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: createPageBodySchema } } },
  },
  responses: {
    201: {
      description: "Page created",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const getPageRoute = createRoute({
  method: "get",
  path: "/pages/{pageId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Read one page",
  description: "A page id from another workspace is reported as not found.",
  request: { params: pageParamsSchema },
  responses: {
    200: {
      description: "Page",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const updatePageRoute = createRoute({
  method: "patch",
  path: "/pages/{pageId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Rename or move a page",
  description:
    "Requires the revision the client loaded; a stale write is a 409 (CT-3). Addresses are normalized and reserved paths are rejected.",
  request: {
    params: pageParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: updatePageBodySchema } } },
  },
  responses: {
    200: {
      description: "Page updated",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const deletePageRoute = createRoute({
  method: "delete",
  path: "/pages/{pageId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Delete a page",
  description:
    "The home page and the last remaining page are refused; the delete and its audit row commit together (FR-019, FR-080).",
  request: { params: pageParamsSchema },
  responses: {
    200: {
      description: "Page deleted",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(deleteResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});


const reorderPageRoute = createRoute({
  method: "patch",
  path: "/pages/{pageId}/order",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Move a page one slot among its siblings",
  description:
    "Swaps the page with its previous or next live sibling. The site row is locked and both revisions advance, so a stale write still loses (FR-020, FR-080, CT-3).",
  request: {
    params: pageParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: reorderPageBodySchema } } },
  },
  responses: {
    200: {
      description: "Page reordered",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const duplicatePageRoute = createRoute({
  method: "post",
  path: "/pages/{pageId}/duplicate",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Duplicate a page beside its source",
  description:
    "The copy keeps the source's parent, takes the next tree slot and a unique address, and copies the draft content as a new draft (FR-020, FR-080).",
  request: { params: pageParamsSchema },
  responses: {
    201: {
      description: "Page duplicated",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const archivePageRoute = createRoute({
  method: "post",
  path: "/pages/{pageId}/archive",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Archive a page",
  description:
    "Retains the page row and content but removes the page from the live tree and the storefront. The home page, the last live page and a parent with live children are refused (FR-020).",
  request: {
    params: pageParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: archivePageBodySchema } } },
  },
  responses: {
    200: {
      description: "Page archived",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const handleListPages: RouteHandler<typeof listPagesRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId } = c.req.valid("param");
  const query = c.req.valid("query");
  const data = await listPages({
    organizationId: actor.organizationId,
    siteId,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: query.limit,
  });
  return c.json(
    {
      success: true as const,
      data,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleListRedirects: RouteHandler<typeof listRedirectsRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId } = c.req.valid("param");
  const query = c.req.valid("query");
  const data = await listRedirects({
    organizationId: actor.organizationId,
    siteId,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: query.limit,
  });
  return c.json(
    {
      success: true as const,
      data,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleCreatePage: RouteHandler<typeof createPageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId } = c.req.valid("param");
  const page = await createPage({
    organizationId: actor.organizationId,
    siteId,
    actorUserId: actor.userId,
    body: c.req.valid("json"),
  });
  return c.json(
    {
      success: true as const,
      data: { page },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    201
  );
};

const handleGetPage: RouteHandler<typeof getPageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const page = await getPage({ organizationId: actor.organizationId, pageId });
  if (page === null) {
    throw new NotFoundError("The requested page was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return c.json(
    {
      success: true as const,
      data: { page },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleUpdatePage: RouteHandler<typeof updatePageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const page = await updatePage({
    organizationId: actor.organizationId,
    pageId,
    actorUserId: actor.userId,
    body: c.req.valid("json"),
  });
  return c.json(
    {
      success: true as const,
      data: { page },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleDeletePage: RouteHandler<typeof deletePageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const data = await deletePage({
    organizationId: actor.organizationId,
    pageId,
    actorUserId: actor.userId,
  });
  return c.json(
    {
      success: true as const,
      data,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};


const handleReorderPage: RouteHandler<typeof reorderPageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const page = await reorderPage({
    organizationId: actor.organizationId,
    pageId,
    actorUserId: actor.userId,
    body: c.req.valid("json"),
  });
  return c.json(
    {
      success: true as const,
      data: { page },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleDuplicatePage: RouteHandler<typeof duplicatePageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const page = await duplicatePage({
    organizationId: actor.organizationId,
    pageId,
    actorUserId: actor.userId,
  });
  return c.json(
    {
      success: true as const,
      data: { page },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    201
  );
};

const handleArchivePage: RouteHandler<typeof archivePageRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const page = await archivePage({
    organizationId: actor.organizationId,
    pageId,
    actorUserId: actor.userId,
    body: c.req.valid("json"),
  });
  return c.json(
    {
      success: true as const,
      data: { page },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

export function createCmsPagesRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(listPagesRoute, handleListPages);
  router.openapi(listRedirectsRoute, handleListRedirects);
  router.openapi(createPageRoute, handleCreatePage);
  router.openapi(getPageRoute, handleGetPage);
  router.openapi(updatePageRoute, handleUpdatePage);
  router.openapi(reorderPageRoute, handleReorderPage);
  router.openapi(duplicatePageRoute, handleDuplicatePage);
  router.openapi(archivePageRoute, handleArchivePage);
  router.openapi(deletePageRoute, handleDeletePage);
  return router;
}