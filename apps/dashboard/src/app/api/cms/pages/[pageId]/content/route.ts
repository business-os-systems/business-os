import { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@suite/core";
import { PageService } from "@suite/website-builder/services";
import { validatePageAst } from "@suite/website-builder/ast";
import { authorizeCmsRequest } from "@/lib/cms-request-guard";
import { problemResponse, successResponse } from "@/lib/api-response";

const PatchContentSchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftAst: z.record(z.unknown()),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const auth = await authorizeCmsRequest(
    request,
    PERMISSIONS.WEBSITE_BUILDER.PAGES_READ
  );
  if (auth.kind === "denied") {
    return auth.response;
  }

  try {
    const { pageId } = await params;
    const service = new PageService();
    const page = await service.getPage(auth.session.organizationId, pageId);

    if (!page) {
      return problemResponse({
        status: 404,
        code: "PAGE_NOT_FOUND",
        title: "Page Not Found",
        detail: `Page ${pageId} not found under tenant organization.`,
      });
    }

    return successResponse({
      id: page.id,
      title: page.title,
      slug: page.slug,
      revision: page.revision,
      status: page.status,
      draftAst: page.draftAst,
      publishedAst: page.publishedAst,
    });
  } catch (err: unknown) {
    console.error("Error loading CMS page content:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while loading page content.",
    });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const auth = await authorizeCmsRequest(
    request,
    PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE
  );
  if (auth.kind === "denied") {
    return auth.response;
  }

  try {
    const { pageId } = await params;
    const rawBody = await request.json().catch(() => ({}));

    const parsed = PatchContentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Invalid Content Mutation Payload",
        detail: parsed.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { expectedRevision, draftAst } = parsed.data;

    // Issue 40: Enforce strict AST JSON structural schema validation at API boundary
    const astValidation = validatePageAst(draftAst);
    if (!astValidation.success) {
      return problemResponse({
        status: 422,
        code: "INVALID_AST_PAYLOAD",
        title: "Invalid Page AST Schema",
        detail: astValidation.message || "Page AST failed structural schema validation.",
        extra: {
          errors: astValidation.errors,
        },
      });
    }

    const service = new PageService();
    const result = await service.updateDraftContent({
      organizationId: auth.session.organizationId,
      pageId,
      expectedRevision,
      draftAst: astValidation.data as unknown as Record<string, unknown>,
    });

    if (!result.success) {
      if (result.errorCode === "CMS_CONCURRENCY_CONFLICT") {
        return problemResponse({
          status: 409,
          code: "CMS_CONCURRENCY_CONFLICT",
          title: "Concurrency Conflict",
          detail: result.message ?? "Page revision conflict.",
          extra: { activeRevision: result.revision },
        });
      }

      return problemResponse({
        status: 404,
        code: result.errorCode ?? "CMS_PAGE_NOT_FOUND",
        title: "Page Not Found",
        detail: result.message ?? "Page not found.",
      });
    }

    return successResponse({
      success: true,
      pageId: result.pageId,
      revision: result.revision,
      draftAst: result.draftAst,
    });
  } catch (err: unknown) {
    console.error("Error updating CMS page content:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while updating page content.",
    });
  }
}
