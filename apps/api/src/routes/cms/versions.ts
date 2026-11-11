import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS } from "@suite/core";
import { createTenantCapabilityGuard, readTenantActor } from "../../middleware/tenant-capability.js";
import {
  listVersionsQuerySchema,
  restoreVersionBodySchema,
  versionParamsSchema,
} from "../../services/cms/contract.js";
import {
  listPageVersions,
  restorePageVersion,
} from "../../services/cms/version-service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const versionSchema = z
  .object({
    id: z.string(),
    pageId: z.string(),
    versionNumber: z.number().int(),
    label: z.string().nullable(),
    createdByUserId: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();

const versionListSchema = z
  .object({ items: z.array(versionSchema), nextCursor: z.string().nullable() })
  .strict();

const restoreResultSchema = z
  .object({
    pageId: z.string(),
    revision: z.number().int(),
    restoredVersion: z.number().int(),
    draftAst: z.unknown(),
    publishedAst: z.unknown().nullable(),
    status: z.string(),
  })
  .strict();

const listVersionsRoute = createRoute({
  method: "get",
  path: "/pages/{pageId}/versions",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List one page's version history",
  description:
    "Cursor-paginated newest-first immutable snapshots. Each entry names the version number, author and change note (FR-032, FR-034, CT-5).",
  request: { params: z.object({ pageId: z.string() }), query: listVersionsQuerySchema },
  responses: {
    200: {
      description: "Version history",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(versionListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const restoreVersionRoute = createRoute({
  method: "post",
  path: "/pages/{pageId}/versions/{versionNumber}/restore",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Restore one version into the draft",
  description:
    "Writes draftAst only; the live site changes solely through the site-wide publish path (FR-033). A stale expectedRevision is a 409 (CT-3).",
  request: {
    params: versionParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: restoreVersionBodySchema } } },
  },
  responses: {
    200: {
      description: "Version restored into the draft",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(restoreResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const handleListVersions: RouteHandler<typeof listVersionsRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const query = c.req.valid("query");
  const data = await listPageVersions({
    organizationId: actor.organizationId,
    pageId,
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

const handleRestoreVersion: RouteHandler<typeof restoreVersionRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId, versionNumber } = c.req.valid("param");
  const body = c.req.valid("json");
  const restored = await restorePageVersion({
    organizationId: actor.organizationId,
    pageId,
    versionNumber,
    expectedRevision: body.expectedRevision,
    actorUserId: actor.userId,
  });
  return c.json(
    {
      success: true as const,
      data: restored,
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

export function createCmsVersionsRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(listVersionsRoute, handleListVersions);
  router.openapi(restoreVersionRoute, handleRestoreVersion);
  return router;
}
