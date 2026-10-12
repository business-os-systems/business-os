import { NextResponse } from "next/server";
import { PageService } from "@suite/website-builder/services";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const tenantId = request.headers.get("x-tenant-id") || "org_default_tenant";

    const service = new PageService();
    const versions = await service.listPageVersions(tenantId, pageId);

    return NextResponse.json({ versions }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch versions" },
      { status: 500 }
    );
  }
}
