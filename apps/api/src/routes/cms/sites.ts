import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import { createTenantCapabilityGuard, readTenantActor } from "../../middleware/tenant-capability.js";
import {
  createSiteBodySchema,
  listSitesQuerySchema,
  siteParamsSchema,
} from "../../services/cms/contract.js";
import {
  createSite,
  getSite,
  listPublishedTemplates,
  listSites,
} from "../../services/cms/site-service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
  readIdempotencyKey,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const siteSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    branchId: z.string().nullable(),
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    timezone: z.string(),
    primaryLocale: z.string(),
    pagesCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const siteListSchema = z
  .object({ items: z.array(siteSchema), nextCursor: z.string().nullable() })
  .strict();

const homePageSchema = z.object({ id: z.string(), title: z.string(), path: z.string() }).strict();

const createSiteResultSchema = z
  .object({
    site: siteSchema,
    homePage: homePageSchema,
    pageCount: z.number().int(),
    replayed: z.boolean(),
  })
  .strict();

const templateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    category: z.string(),
    industries: z.array(z.string()),
    currentVersion: z.number().int(),
    previewRef: z.string().nullable(),
  })
  .strict();

const templateListSchema = z.object({ items: z.array(templateSchema) }).strict();

const listSitesRoute = createRoute({
  method: "get",
  path: "/sites",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List this workspace's sites",
  description:
    "Cursor-paginated sites for the verified workspace only. Identity comes from the session, never a query parameter (contract cms-admin, CT-5).",
  request: { query: listSitesQuerySchema },
  responses: {
    200: {
      description: "Sites",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(siteListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.SITES_READ)],
});

const createSiteRoute = createRoute({
  method: "post",
  path: "/sites",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Create a site from a published template or blank",
  description:
    "Provisions the site, its copied page tree and its home page in one transaction. The Idempotency-Key header is required; a replay resolves to the same site (FR-017, CT-4).",
  request: {
    headers: z.object({ "Idempotency-Key": z.string().optional() }),
    body: { content: { [CMS_JSON_CONTENT]: { schema: createSiteBodySchema } } },
  },
  responses: {
    201: {
      description: "Site provisioned",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(createSiteResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE)],
});

const getSiteRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Read one site in the workspace",
  description:
    "A site id belonging to another workspace is reported as not found, indistinguishable from a missing id.",
  request: { params: siteParamsSchema },
  responses: {
    200: {
      description: "Site",
      content: {
        [CMS_JSON_CONTENT]: { schema: cmsEnvelope(z.object({ site: siteSchema })) },
      },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.SITES_READ)],
});

const listTemplatesRoute = createRoute({
  method: "get",
  path: "/templates",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List published templates visible to this workspace",
  description:
    "Only ACTIVE TEMPLATE catalog items with a published version are returned; global and this workspace's tenant rows are visible (FR-017).",
  responses: {
    200: {
      description: "Published templates",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(templateListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const handleListSites: RouteHandler<typeof listSitesRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const query = c.req.valid("query");
  const data = await listSites({
    organizationId: actor.organizationId,
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

const handleCreateSite: RouteHandler<typeof createSiteRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const body = c.req.valid("json");
  const data = await createSite({
    organizationId: actor.organizationId,
    branchId: actor.branchId,
    actorUserId: actor.userId,
    idempotencyKey: readIdempotencyKey(c),
    body,
  });
  return c.json(
    {
      success: true as const,
      data,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    201
  );
};

const handleGetSite: RouteHandler<typeof getSiteRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { siteId } = c.req.valid("param");
  const site = await getSite({ organizationId: actor.organizationId, siteId });
  if (site === null) {
    throw new NotFoundError("The requested site was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return c.json(
    {
      success: true as const,
      data: { site },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleListTemplates: RouteHandler<typeof listTemplatesRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const items = await listPublishedTemplates(actor.organizationId);
  return c.json(
    {
      success: true as const,
      data: { items },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

export function createCmsSitesRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(listSitesRoute, handleListSites);
  router.openapi(createSiteRoute, handleCreateSite);
  router.openapi(getSiteRoute, handleGetSite);
  router.openapi(listTemplatesRoute, handleListTemplates);
  return router;
}