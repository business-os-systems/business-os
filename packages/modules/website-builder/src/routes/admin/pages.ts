import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isAppError } from "@suite/core/errors";
import { PageService } from "../../services/page-service.js";

const ProblemDetailsSchema = z.object({
  type: z.string().url().or(z.string().regex(/^\/[a-zA-Z0-9_\-/]+$/)),
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

const PageVersionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  pageId: z.string(),
  versionNumber: z.number().int(),
  label: z.string().nullable().optional(),
  astSnapshot: z.record(z.unknown()),
  createdByUserId: z.string().nullable().optional(),
  createdAt: z.string(),
});

const RollbackBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
});

/**
 * Route: GET /api/v1/cms/admin/pages/:pageId/versions
 */
export const listPageVersionsRoute = createRoute({
  method: "get",
  path: "/pages/:pageId/versions",
  summary: "List Page Version Snapshots",
  description: "Lists all immutable published version snapshots for a page in descending version order.",
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
      description: "Version history retrieved successfully",
      content: {
        "application/json": {
          schema: z.object({
            versions: z.array(PageVersionSchema),
          }),
        },
      },
    },
  },
});

/**
 * Route: POST /api/v1/cms/admin/pages/:pageId/versions/:versionNumber/rollback
 */
export const rollbackVersionRoute = createRoute({
  method: "post",
  path: "/pages/:pageId/versions/:versionNumber/rollback",
  summary: "Rollback Page to Prior Version Snapshot",
  description: "Restores draft and published AST to an immutable historical version snapshot.",
  request: {
    params: z.object({
      pageId: z.string().min(1),
      versionNumber: z.coerce.number().int().positive(),
    }),
    headers: z.object({
      "x-tenant-id": z.string().min(1),
    }),
    body: {
      content: {
        "application/json": {
          schema: RollbackBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Page rolled back successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            pageId: z.string(),
            revision: z.number().int(),
            restoredVersion: z.number().int(),
            draftAst: z.record(z.unknown()),
          }),
        },
      },
    },
    404: {
      description: "Page or version snapshot not found",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
    409: {
      description: "CAS Concurrency conflict during rollback",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
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
      // Typed application errors (including quota refusals) are RFC 7807
      // messages; let the app error handler render them instead of flattening
      // them to a generic 400.
      if (isAppError(err)) {
        throw err;
      }

      return c.json(
        {
          type: "/errors/cms-page-creation-failed",
          title: "Page Creation Failed",
          status: 400,
          code: "CMS_PAGE_CREATION_FAILED",
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
          type: "/errors/cms-page-not-found",
          title: "Page Not Found",
          status: 404,
          code: "CMS_PAGE_NOT_FOUND",
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
            type: "/errors/cms-concurrency-conflict",
            title: "Concurrency Conflict",
            status: 409,
            code: "CMS_CONCURRENCY_CONFLICT",
            detail: result.message ?? "Page revision conflict.",
            instance: c.req.path,
            activeRevision: result.revision,
          },
          409
        );
      }

      return c.json(
        {
          type: "/errors/cms-page-not-found",
          title: "Page Not Found",
          status: 404,
          code: "CMS_PAGE_NOT_FOUND",
          detail: result.message ?? "Page not found.",
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
          type: "/errors/cms-concurrency-conflict",
          title: "Concurrency Conflict on Publish",
          status: 409,
          code: "CMS_CONCURRENCY_CONFLICT",
          detail: result.message ?? "Page revision conflict.",
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

  // GET /pages/:pageId/versions
  router.openapi(listPageVersionsRoute, async (c) => {
    const { pageId } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");

    const versions = await pageService.listPageVersions(tenantId, pageId);
    return c.json({ versions }, 200);
  });

  // POST /pages/:pageId/versions/:versionNumber/rollback
  router.openapi(rollbackVersionRoute, async (c) => {
    const { pageId, versionNumber } = c.req.valid("param");
    const { "x-tenant-id": tenantId } = c.req.valid("header");
    const body = c.req.valid("json");

    const result = await pageService.rollbackPageVersion({
      organizationId: tenantId,
      pageId,
      versionNumber,
      expectedRevision: body.expectedRevision,
    });

    if (!result.success) {
      if (result.errorCode === "CMS_CONCURRENCY_CONFLICT") {
        return c.json(
          {
            type: "/errors/cms-concurrency-conflict",
            title: "Concurrency Conflict on Rollback",
            status: 409,
            code: "CMS_CONCURRENCY_CONFLICT",
            detail: result.message ?? "Page revision conflict.",
            instance: c.req.path,
            activeRevision: result.revision,
          },
          409
        );
      }

      return c.json(
        {
          type: "/errors/cms-not-found",
          title: "Resource Not Found",
          status: 404,
          code: "CMS_NOT_FOUND",
          detail: result.message ?? "Version or page not found.",
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
        restoredVersion: result.restoredVersion,
        draftAst: result.draftAst,
      },
      200
    );
  });

  return router;
}
