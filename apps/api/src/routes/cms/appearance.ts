import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";
import { PERMISSIONS } from "@suite/core";
import { AppearanceTokensSchema } from "@suite/website-builder/appearance";
import { createTenantCapabilityGuard, readTenantActor } from "../../middleware/tenant-capability.js";
import {
  appearanceVersionBodySchema,
  selectAppearanceThemeBodySchema,
  siteParamsSchema,
  updateAppearanceBodySchema,
} from "../../services/cms/contract.js";
import {
  getSiteAppearance,
  listPublishedThemes,
  publishSiteAppearance,
  resetSiteAppearance,
  selectAppearanceTheme,
  updateSiteAppearance,
} from "../../services/cms/appearance-service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  readCmsRequestId,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const appearanceSchema = z
  .object({
    siteId: z.string(),
    brandName: z.string(),
    brandLogoUrl: z.string().nullable(),
    draftTokens: AppearanceTokensSchema,
    publishedTokens: AppearanceTokensSchema,
    sourceItemId: z.string().nullable(),
    sourceVersion: z.number().int().nullable(),
    version: z.number().int(),
    publishedAt: z.string().datetime(),
    hasUnpublishedChanges: z.boolean(),
  })
  .strict();

const themeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    category: z.string(),
    industries: z.array(z.string()),
    currentVersion: z.number().int(),
    previewRef: z.string().nullable(),
    tokens: AppearanceTokensSchema,
  })
  .strict();

const appearanceResultSchema = z.object({ appearance: appearanceSchema }).strict();
const themeListSchema = z.object({ items: z.array(themeSchema) }).strict();

const APPEARANCE_DESCRIPTION =
  "Appearance identity comes from the verified session; the route never accepts an organization id. Every mutation is version-checked (CT-3) and writes its audit row in the same transaction (CT-1).";

const readAppearanceRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}/appearance",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Read a site's appearance snapshot",
  description:
    "Returns the site's own complete draft and published token snapshots. A site id from another workspace is reported as not found (FR-150, FR-155). " +
    APPEARANCE_DESCRIPTION,
  request: { params: siteParamsSchema },
  responses: {
    200: {
      description: "Appearance",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(appearanceResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE)],
});

const updateAppearanceRoute = createRoute({
  method: "put",
  path: "/sites/{siteId}/appearance",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Edit this site's draft appearance and brand basics",
  description:
    "Merges the supplied tokens into this site's draft snapshot and updates the logo or brand name. Visitors keep seeing the published snapshot until a publish (FR-151, FR-154). " +
    APPEARANCE_DESCRIPTION,
  request: {
    params: siteParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: updateAppearanceBodySchema } } },
  },
  responses: {
    200: {
      description: "Draft appearance updated",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(appearanceResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE)],
});

const selectThemeRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/appearance/theme",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Select a published catalog theme",
  description:
    "Copies the published theme's token values into this site's draft snapshot and records the source item and version. A later platform theme edit cannot change this site (FR-152). " +
    APPEARANCE_DESCRIPTION,
  request: {
    params: siteParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: selectAppearanceThemeBodySchema } } },
  },
  responses: {
    200: {
      description: "Theme copied into the site",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(appearanceResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE)],
});

const resetThemeRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/appearance/reset",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Reset the draft appearance to the selected theme values",
  description:
    "Restores the token values captured when the current theme was selected; the restored draft still needs a publish to reach visitors (FR-157). " +
    APPEARANCE_DESCRIPTION,
  request: {
    params: siteParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: appearanceVersionBodySchema } } },
  },
  responses: {
    200: {
      description: "Draft appearance reset",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(appearanceResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE)],
});

const publishAppearanceRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/appearance/publish",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Publish this site's draft appearance",
  description:
    "Copies the draft snapshot into the visitor-facing snapshot. Appearance edits never reach visitors before this call (FR-154). " +
    APPEARANCE_DESCRIPTION,
  request: {
    params: siteParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: appearanceVersionBodySchema } } },
  },
  responses: {
    200: {
      description: "Appearance published",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(appearanceResultSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE)],
});

const listThemesRoute = createRoute({
  method: "get",
  path: "/themes",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List published themes visible to this workspace",
  description:
    "Only ACTIVE THEME catalog items with a published version are returned; global and this workspace's tenant rows are visible (FR-151).",
  responses: {
    200: {
      description: "Published themes",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(themeListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE)],
});

const handleReadAppearance: RouteHandler<typeof readAppearanceRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const appearance = await getSiteAppearance({
    organizationId: actor.organizationId,
    siteId: c.req.valid("param").siteId,
  });
  return c.json(
    {
      success: true as const,
      data: { appearance },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleUpdateAppearance: RouteHandler<typeof updateAppearanceRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const body = c.req.valid("json");
  const appearance = await updateSiteAppearance({
    organizationId: actor.organizationId,
    siteId: c.req.valid("param").siteId,
    actorUserId: actor.userId,
    expectedVersion: body.expectedVersion,
    body,
  });
  return c.json(
    {
      success: true as const,
      data: { appearance },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleSelectTheme: RouteHandler<typeof selectThemeRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const body = c.req.valid("json");
  const appearance = await selectAppearanceTheme({
    organizationId: actor.organizationId,
    siteId: c.req.valid("param").siteId,
    actorUserId: actor.userId,
    expectedVersion: body.expectedVersion,
    body,
  });
  return c.json(
    {
      success: true as const,
      data: { appearance },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleResetTheme: RouteHandler<typeof resetThemeRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const body = c.req.valid("json");
  const appearance = await resetSiteAppearance({
    organizationId: actor.organizationId,
    siteId: c.req.valid("param").siteId,
    actorUserId: actor.userId,
    expectedVersion: body.expectedVersion,
  });
  return c.json(
    {
      success: true as const,
      data: { appearance },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handlePublishAppearance: RouteHandler<typeof publishAppearanceRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const body = c.req.valid("json");
  const appearance = await publishSiteAppearance({
    organizationId: actor.organizationId,
    siteId: c.req.valid("param").siteId,
    actorUserId: actor.userId,
    expectedVersion: body.expectedVersion,
  });
  return c.json(
    {
      success: true as const,
      data: { appearance },
      requestId: readCmsRequestId(c),
      timestamp: new Date().toISOString(),
    },
    200
  );
};

const handleListThemes: RouteHandler<typeof listThemesRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const items = await listPublishedThemes(actor.organizationId);
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

export function createCmsAppearanceRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(readAppearanceRoute, handleReadAppearance);
  router.openapi(updateAppearanceRoute, handleUpdateAppearance);
  router.openapi(selectThemeRoute, handleSelectTheme);
  router.openapi(resetThemeRoute, handleResetTheme);
  router.openapi(publishAppearanceRoute, handlePublishAppearance);
  router.openapi(listThemesRoute, handleListThemes);
  return router;
}
