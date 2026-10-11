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

const UpdateContentBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftAst: z.record(z.unknown()),
});

const PublishBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
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
