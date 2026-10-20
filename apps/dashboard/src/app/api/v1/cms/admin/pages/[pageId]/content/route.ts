import { NextResponse } from "next/server";
import { PageService } from "@suite/website-builder/services";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const tenantId = request.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json(
        {
          type: "/errors/missing-tenant-header",
          title: "Missing Tenant Identifier",
          status: 400,
          code: "MISSING_TENANT_HEADER",
          detail: "x-tenant-id header is required.",
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const service = new PageService();
    const result = await service.updateDraftContent({
      organizationId: tenantId,
      pageId,
      expectedRevision: body.expectedRevision,
      draftAst: body.draftAst,
    });

    if (!result.success) {
      if (result.errorCode === "CMS_CONCURRENCY_CONFLICT") {
        return NextResponse.json(
          {
            type: "/errors/concurrency-conflict",
            title: "Concurrency Conflict",
            status: 409,
            code: "CMS_CONCURRENCY_CONFLICT",
            detail: result.message ?? "Page revision conflict.",
            activeRevision: result.revision,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Page Not Found",
          status: 404,
          code: "CMS_PAGE_NOT_FOUND",
          detail: result.message ?? "Page not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        pageId: result.pageId,
        revision: result.revision,
        draftAst: result.draftAst,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        detail: err instanceof Error ? err.message : "Failed to update page content",
      },
      { status: 500 }
    );
  }
}
