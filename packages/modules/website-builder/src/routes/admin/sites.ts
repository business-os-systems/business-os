import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SiteService } from "../../services/site-service.js";

const ProblemDetailsSchema = z.object({
  type: z.string().url().or(z.string().regex(/^\/[a-zA-Z0-9_\-/]+$/)),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
});

const SiteSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  branchId: z.string().nullable(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  timezone: z.string(),
  primaryLocale: z.string(),
  pagesCount: z.number().int(),
  primaryDomain: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateSiteBodySchema = z.object({
  title: z.string().min(1).max(191),
  slug: z.string().min(1).max(191),
  branchId: z.string().optional(),
  primaryLocale: z.string().optional(),
  timezone: z.string().optional(),
  brandName: z.string().optional(),
  initialTemplate: z.enum(["blank", "hero_starter"]).optional(),
});

/**
 * Route: GET /api/v1/cms/admin/sites
 */
export const listSitesRoute = createRoute({
  method: "get",
  path: "/sites",
  summary: "List Organization Sites",
  description: "Lists all sites belonging to the authenticated tenant organization.",
  request: {
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "Sites retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            sites: z.array(SiteSummarySchema),
          }),
        },
      },
    },
  },
});

/**
 * Route: POST /api/v1/cms/admin/sites
 */
export const createSiteRoute = createRoute({
  method: "post",
  path: "/sites",
  summary: "Create and Provision New Site",
  description: "Atomically provisions a site, settings, domain, and initial home page.",
  request: {
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateSiteBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Site provisioned successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            site: z.object({
              id: z.string(),
              title: z.string(),
              slug: z.string(),
              status: z.string(),
            }),
            homePage: z.object({
              id: z.string(),
              title: z.string(),
              slug: z.string(),
            }),
          }),
        },
      },
    },
    400: {
      description: "Invalid input",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

/**
 * Route: GET /api/v1/cms/admin/sites/:siteId
 */
export const getSiteRoute = createRoute({
  method: "get",
  path: "/sites/:siteId",
  summary: "Get Site Details",
  description: "Retrieves complete metadata, settings, and domains for a single site.",
  request: {
    params: z.object({
      siteId: z.string().min(1),
    }),
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "Site details retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            site: z.record(z.unknown()),
          }),
        },
      },
    },
    404: {
      description: "Site not found",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

export function createAdminSitesRouter(
  siteService: SiteService = new SiteService()
): OpenAPIHono {
  const router = new OpenAPIHono();

  // GET /sites
  router.openapi(listSitesRoute, async (c) => {
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const sites = await siteService.listSites(tenantId);
    return c.json({ sites }, 200);
  });

  // POST /sites
  router.openapi(createSiteRoute, async (c) => {
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const body = c.req.valid("json");

    try {
      const result = await siteService.createSite({
        organizationId: tenantId,
        branchId: body.branchId,
        title: body.title,
        slug: body.slug,
        primaryLocale: body.primaryLocale,
        timezone: body.timezone,
        brandName: body.brandName,
        initialTemplate: body.initialTemplate,
      });

      return c.json(
        {
          success: true,
          site: {
            id: result.site.id,
            title: result.site.title,
            slug: result.site.slug,
            status: result.site.status,
          },
          homePage: {
            id: result.homePage.id,
            title: result.homePage.title,
            slug: result.homePage.slug,
          },
        },
        201
      );
    } catch (err: unknown) {
      return c.json(
        {
          type: "/errors/cms-site-creation-failed",
          title: "Site Creation Failed",
          status: 400,
          code: "CMS_SITE_CREATION_FAILED",
          detail: err instanceof Error ? err.message : "Failed to provision site.",
          instance: c.req.path,
        },
        400
      );
    }
  });

  // GET /sites/:siteId
  router.openapi(getSiteRoute, async (c) => {
    const { siteId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");

    const site = await siteService.getSite(tenantId, siteId);
    if (!site) {
      return c.json(
        {
          type: "/errors/cms-site-not-found",
          title: "Site Not Found",
          status: 404,
          code: "CMS_SITE_NOT_FOUND",
          detail: `Site with id ${siteId} does not exist in tenant organization.`,
          instance: c.req.path,
        },
        404
      );
    }

    return c.json({ site: site as unknown as Record<string, unknown> }, 200);
  });

  return router;
}
