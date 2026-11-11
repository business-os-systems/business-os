import { createRoute, OpenAPIHono, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS } from "@suite/core";
import { createTenantCapabilityGuard, readTenantActor } from "../../middleware/tenant-capability.js";
import {
  catalogSectionsResultSchema,
  listCatalogSectionsQuerySchema,
} from "../../services/cms/contract.js";
import { listTenantCatalogSections } from "../../services/cms/catalog-section.service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const listSectionsRoute = createRoute({
  method: "get",
  path: "/catalog/sections",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List the sections this workspace may insert",
  description:
    "Returns published ACTIVE SECTION catalog rows that target this tenant: global rows plus the tenant's own rows, resolved through the shared targeting resolver. Draft, disabled and other-tenant rows never appear (FR-008, FR-022).",
  request: { query: listCatalogSectionsQuerySchema },
  responses: {
    200: {
      description: "Tenant-visible sections",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(catalogSectionsResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ)],
});

const handleListSections: RouteHandler<typeof listSectionsRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { limit } = c.req.valid("query");
  const items = await listTenantCatalogSections({ organizationId: actor.organizationId, limit });
  return c.json(
    {
      success: true as const,
      data: { items: [...items] },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

export function createCmsCatalogRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(listSectionsRoute, handleListSections);
  return router;
}
