import { createRoute, OpenAPIHono, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { ConflictError } from "@suite/core/errors";
import { createTenantCapabilityGuard, readTenantActor } from "../../middleware/tenant-capability.js";
import {
  pageContentResultSchema,
  pageParamsSchema,
  savePageContentBodySchema,
} from "../../services/cms/contract.js";
import { getPageContent, savePageDraft } from "../../services/cms/page-content.service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const getContentRoute = createRoute({
  method: "get",
  path: "/pages/{pageId}/content",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Read a page's draft and published content",
  description:
    "Returns the draft AST, the published AST and the revision the editor must send back. A page from another workspace is a 404 (contract cms-admin).",
  request: { params: pageParamsSchema },
  responses: {
    200: {
      description: "Page content",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageContentResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const saveContentRoute = createRoute({
  method: "patch",
  path: "/pages/{pageId}/content",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Autosave a page draft",
  description:
    "Writes the draft only when expectedRevision is still current. A stale save returns 409 VERSION_CONFLICT, never overwrites the newer revision, and retains the rejected draft in version history (FR-026, FR-027, CT-3).",
  request: {
    params: pageParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: savePageContentBodySchema } } },
  },
  responses: {
    200: {
      description: "Draft saved",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(pageContentResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE)],
});

const handleGetContent: RouteHandler<typeof getContentRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const content = await getPageContent({ organizationId: actor.organizationId, pageId });
  return c.json(
    {
      success: true as const,
      data: { content },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleSaveContent: RouteHandler<typeof saveContentRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { pageId } = c.req.valid("param");
  const body = c.req.valid("json");
  const outcome = await savePageDraft({
    organizationId: actor.organizationId,
    pageId,
    actorUserId: actor.userId,
    expectedRevision: body.expectedRevision,
    draftAst: body.draftAst,
  });
  if (outcome.kind === "conflict") {
    throw new ConflictError(
      "The page changed since it was loaded, so the save was not applied. Your draft was kept in version history as version " +
        outcome.retainedVersion +
        ". Reload to compare both versions.",
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
    );
  }
  return c.json(
    {
      success: true as const,
      data: { content: outcome.content },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

export function createCmsContentRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(getContentRoute, handleGetContent);
  router.openapi(saveContentRoute, handleSaveContent);
  return router;
}
