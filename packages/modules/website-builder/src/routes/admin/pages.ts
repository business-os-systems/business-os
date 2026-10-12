import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { PageService } from "../../services/page-service.js";

const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  activeRevision: z.number().int().optional(),
});

const PageSummarySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  siteId: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  revision: z.number().int(),
  isHomePage: z.boolean(),
  orderIndex: z.number().int(),
  draftAst: z.record(z.unknown()),
  publishedAst: z.record(z.unknown()).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
});

const CreatePageBodySchema = z.object({
  title: z.string().min(1).max(191),
  slug: z.string().min(1).max(191),
  isHomePage: z.boolean().optional(),
  orderIndex: z.number().int().optional(),
  draftAst: z.record(z.unknown()).optional(),
});

const UpdateContentBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftAst: z.record(z.unknown()),
});

const PublishBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
});

/**
 * Route: GET /api/v1/cms/admin/sites/:siteId/pages
 */
export const listPagesRoute = createRoute({
  method: "get",
  path: "/sites/:siteId/pages",
  summary: "List Site Pages",
  description: "Lists all pages belonging to the specified site in the tenant organization.",
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
      description: "Pages retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            pages: z.array(PageSummarySchema),
          }),
        },
      },
    },
  },
});

/**
 * Route: POST /api/v1/cms/admin/sites/:siteId/pages
 */
export const createPageRoute = createRoute({
  method: "post",
  path: "/sites/:siteId/pages",
  summary: "Create New Page",
  description: "Creates a new page within a site and initializes draft AST content.",
  request: {
    params: z.object({
      siteId: z.string().min(1),
    }),
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreatePageBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Page created successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            page: PageSummarySchema,
          }),
        },
      },
    },
    400: {
      description: "Failed to create page",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

/**
 * Route: GET /api/v1/cms/admin/pages/:pageId/content
 */
export const getPageContentRoute = createRoute({
  method: "get",
  path: "/pages/:pageId/content",
  summary: "Get Page Content & Revision",
  description: "Fetches draft AST and current CAS revision for authoring.",
  request: {
    params: z.object({
      pageId: z.string().min(1),
    }),
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "Page content retrieved successfully",
      content: {
        "application/json": {
          schema: PageSummarySchema,
        },
      },
    },
    404: {
      description: "Page not found",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

/**
 * Route: PATCH /api/v1/cms/admin/pages/:pageId/content
 */
export const updatePageContentRoute = createRoute({
  method: "patch",
  path: "/pages/:pageId/content",
  summary: "Update Draft Page Content with CAS Concurrency Control",
  description:
    "Autosaves draft AST modifications. Rejects with 409 Conflict if expectedRevision does not match current database revision.",
  request: {
    params: z.object({
      pageId: z.string().min(1),
    }),
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateContentBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Draft content updated and revision incremented successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            pageId: z.string(),
            revision: z.number().int(),
            draftAst: z.record(z.unknown()),
          }),
        },
      },
    },
    404: {
      description: "Page not found within current tenant organization",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
    409: {
      description: "CAS Concurrency conflict: Revision mismatch",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

/**
 * Route: POST /api/v1/cms/admin/pages/:pageId/publish
 */
export const publishPageRoute = createRoute({
  method: "post",
  path: "/pages/:pageId/publish",
  summary: "Publish Draft Page to Edge Production",
  description:
    "Promotes draftAst -> publishedAst, increments revision, and creates version snapshot.",
  request: {
    params: z.object({
      pageId: z.string().min(1),
    }),
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
    body: {
      content: {
        "application/json": {
          schema: PublishBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Page published successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            pageId: z.string(),
            revision: z.number().int(),
            versionNumber: z.number().int(),
          }),
        },
      },
    },
    409: {
      description: "CAS Concurrency conflict during publish",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

export function createAdminPagesRouter(
  pageService: PageService = new PageService()
): OpenAPIHono {
  const router = new OpenAPIHono();

  // GET /sites/:siteId/pages
  router.openapi(listPagesRoute, async (c) => {
    const { siteId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const pages = await pageService.listPages(tenantId, siteId);
    return c.json({ pages }, 200);
  });

  // POST /sites/:siteId/pages
  router.openapi(createPageRoute, async (c) => {
    const { siteId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const body = c.req.valid("json");

    try {
      const page = await pageService.createPage({
        organizationId: tenantId,
        siteId,
        title: body.title,
        slug: body.slug,
        isHomePage: body.isHomePage,
        orderIndex: body.orderIndex,
        draftAst: body.draftAst,
      });

      return c.json({ success: true, page }, 201);
    } catch (err: unknown) {
      return c.json(
        {
          type: "https://errors.business-os.com/cms/page-creation-failed",
          title: "Page Creation Failed",
          status: 400,
          detail: err instanceof Error ? err.message : "Failed to create page.",
          instance: c.req.path,
        },
        400
      );
    }
  });

  // GET /pages/:pageId/content
  router.openapi(getPageContentRoute, async (c) => {
    const { pageId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");

    const page = await pageService.getPage(tenantId, pageId);
    if (!page) {
      return c.json(
        {
          type: "https://errors.business-os.com/cms/page-not-found",
          title: "Page Not Found",
          status: 404,
          detail: `Page with id ${pageId} does not exist in tenant organization.`,
          instance: c.req.path,
        },
        404
      );
    }

    return c.json(
      {
        ...page,
        publishedAst: page.publishedAst ?? null,
      },
      200
    );
  });

  // PATCH /pages/:pageId/content
  router.openapi(updatePageContentRoute, async (c) => {
    const { pageId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const body = c.req.valid("json");

    const result = await pageService.updateDraftContent({
      organizationId: tenantId,
      pageId,
      expectedRevision: body.expectedRevision,
      draftAst: body.draftAst,
    });

    if (!result.success) {
      if (result.errorCode === "CMS_CONCURRENCY_CONFLICT") {
        return c.json(
          {
            type: "https://errors.business-os.com/cms/concurrency-conflict",
            title: "Concurrency Conflict",
            status: 409,
            detail: result.message || "Page revision conflict.",
            instance: c.req.path,
            activeRevision: result.revision,
          },
          409
        );
      }

      return c.json(
        {
          type: "https://errors.business-os.com/cms/page-not-found",
          title: "Page Not Found",
          status: 404,
          detail: result.message || "Page not found.",
          instance: c.req.path,
        },
        404
      );
    }

    return c.json(
      {
        success: true,
        pageId: result.pageId,
        revision: result.revision,
        draftAst: result.draftAst,
      },
      200
    );
  });

  // POST /pages/:pageId/publish
  router.openapi(publishPageRoute, async (c) => {
    const { pageId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const body = c.req.valid("json");

    const result = await pageService.publishPage({
      organizationId: tenantId,
      pageId,
      expectedRevision: body.expectedRevision,
    });

    if (!result.success) {
      return c.json(
        {
          type: "https://errors.business-os.com/cms/concurrency-conflict",
          title: "Concurrency Conflict on Publish",
          status: 409,
          detail: result.message || "Page revision conflict.",
          instance: c.req.path,
          activeRevision: result.revision,
        },
        409
      );
    }

    return c.json(
      {
        success: true,
        pageId: result.pageId,
        revision: result.revision,
        versionNumber: result.versionNumber,
      },
      200
    );
  });

  return router;
}
