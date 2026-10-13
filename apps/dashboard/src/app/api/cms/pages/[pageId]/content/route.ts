import { NextResponse } from "next/server";
import { z } from "zod";
import { PageService } from "@suite/website-builder/services";

const PatchContentSchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftAst: z.record(z.unknown()),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const tenantId = request.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Organization context header (x-tenant-id) is required to view page content.",
        },
        { status: 401 }
      );
    }

    const service = new PageService();
    const page = await service.getPage(tenantId, pageId);

    if (!page) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "PAGE_NOT_FOUND",
          title: "Page Not Found",
          status: 404,
          detail: `Page ${pageId} not found under tenant organization.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        id: page.id,
        title: page.title,
        slug: page.slug,
        revision: page.revision,
        status: page.status,
        draftAst: page.draftAst,
        publishedAst: page.publishedAst,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load page content" },
      { status: 500 }
    );
  }
}

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
          type: "about:blank",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Organization context header (x-tenant-id) is required to update page content.",
        },
        { status: 401 }
      );
    }
    const rawBody = await request.json().catch(() => ({}));

    const parsed = PatchContentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "VALIDATION_ERROR",
          title: "Invalid Content Mutation Payload",
          status: 400,
          detail: parsed.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400 }
      );
    }

    const { expectedRevision, draftAst } = parsed.data;

    const service = new PageService();
    const result = await service.updateDraftContent({
      organizationId: tenantId,
      pageId,
      expectedRevision,
      draftAst,
    });

    if (!result.success) {
      if (result.errorCode === "CMS_CONCURRENCY_CONFLICT") {
        return NextResponse.json(
          {
            type: "about:blank",
            code: "CMS_CONCURRENCY_CONFLICT",
            title: "Concurrency Conflict",
            status: 409,
            detail: result.message ?? "Page revision conflict.",
            activeRevision: result.revision,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          type: "about:blank",
          code: result.errorCode ?? "CMS_PAGE_NOT_FOUND",
          title: "Page Not Found",
          status: 404,
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
      { error: err instanceof Error ? err.message : "Failed to update page content" },
      { status: 500 }
    );
  }
}
