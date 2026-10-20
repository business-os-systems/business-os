import { NextResponse } from "next/server";
import { z } from "zod";
import { PageService } from "@suite/website-builder/services";
import { resolveTenantContext } from "@/lib/tenant-context";
import { problemResponse } from "@/lib/problem-response";

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
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const rawBody = await request.json().catch(() => ({}));

    const parsed = PublishBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Invalid Publish Payload",
        detail: parsed.error.issues[0]?.message ?? "expectedRevision must be a positive integer",
      });
    }

    const { expectedRevision, createdByUserId } = parsed.data;

    const service = new PageService();
    const result = await service.publishPage({
      organizationId: tenantContext.organizationId,
      pageId,
      expectedRevision,
      createdByUserId: createdByUserId || tenantContext.userId,
    });

    if (!result.success) {
      const status = result.errorCode === "CMS_CONCURRENCY_CONFLICT" ? 409 : 400;
      return problemResponse({
        status,
        code: result.errorCode ?? "CMS_PUBLISH_FAILED",
        title: "Publish Failed",
        detail: result.message ?? "Failed to publish page",
        extra: { activeRevision: result.revision },
      });
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
    console.error("Error publishing CMS page:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while publishing page.",
    });
  }
}
