import { NextResponse } from "next/server";
import { PageService } from "@suite/website-builder/services";
import { resolveTenantContext } from "@/lib/tenant-context";
import { problemResponse } from "@/lib/problem-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const service = new PageService();
    const versions = await service.listPageVersions(tenantContext.organizationId, pageId);

    return NextResponse.json({ versions }, { status: 200 });
  } catch (err: unknown) {
    console.error("Error fetching CMS page versions:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while fetching versions.",
    });
  }
}
