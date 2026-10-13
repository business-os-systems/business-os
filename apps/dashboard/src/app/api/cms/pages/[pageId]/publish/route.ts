import { NextResponse } from "next/server";
import { z } from "zod";
import { PageService } from "@suite/website-builder/services";

const PublishBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  createdByUserId: z.string().optional(),
});

export async function POST(
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
          detail: "Organization context header (x-tenant-id) is required to publish a page.",
        },
        { status: 401 }
      );
    }
    const rawBody = await request.json().catch(() => ({}));

    const parsed = PublishBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "VALIDATION_ERROR",
          title: "Invalid Publish Payload",
          status: 400,
          detail: parsed.error.issues[0]?.message ?? "expectedRevision must be a positive integer",
        },
        { status: 400 }
      );
    }

    const { expectedRevision, createdByUserId } = parsed.data;

    const service = new PageService();
    const result = await service.publishPage({
      organizationId: tenantId,
      pageId,
      expectedRevision,
      createdByUserId,
    });

    if (!result.success) {
      const status = result.errorCode === "CMS_CONCURRENCY_CONFLICT" ? 409 : 400;
      return NextResponse.json(
        {
          type: "about:blank",
          code: result.errorCode ?? "CMS_PUBLISH_FAILED",
          title: "Publish Failed",
          status,
          detail: result.message ?? "Failed to publish page",
          activeRevision: result.revision,
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        pageId: result.pageId,
        revision: result.revision,
        versionNumber: result.versionNumber,
        publishedAst: result.publishedAst,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to publish page" },
      { status: 500 }
    );
  }
}
