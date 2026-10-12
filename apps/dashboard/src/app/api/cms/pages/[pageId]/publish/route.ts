import { NextResponse } from "next/server";
import { PageService } from "@suite/website-builder/services";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const body = await request.json().catch(() => ({}));
    const tenantId = request.headers.get("x-tenant-id") || "org_default_tenant";
    const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : 1;

    const service = new PageService();
    const result = await service.publishPage({
      organizationId: tenantId,
      pageId,
      expectedRevision,
      createdByUserId: body.createdByUserId,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          type: "https://errors.business-os.com/cms/concurrency-conflict",
          title: "Publish Failed",
          status: result.errorCode === "CMS_CONCURRENCY_CONFLICT" ? 409 : 400,
          detail: result.message || "Failed to publish page",
          activeRevision: result.revision,
        },
        { status: result.errorCode === "CMS_CONCURRENCY_CONFLICT" ? 409 : 400 }
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
