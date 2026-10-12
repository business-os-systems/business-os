import { NextResponse } from "next/server";
import { PageService } from "@suite/website-builder/services";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const tenantId = request.headers.get("x-tenant-id") || "org_default_tenant";

    const service = new PageService();
    const pages = await service.listPages(tenantId, siteId);

    return NextResponse.json({ pages }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch pages" },
      { status: 500 }
    );
  }
}
