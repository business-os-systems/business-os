import { NextResponse } from "next/server";
import { SiteService } from "@suite/website-builder/services";

export async function GET(request: Request) {
  try {
    const tenantId = request.headers.get("x-tenant-id") || "org_default_tenant";
    const service = new SiteService();
    const sites = await service.listSites(tenantId);
    return NextResponse.json({ sites }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch sites" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tenantId = request.headers.get("x-tenant-id") || "org_default_tenant";

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "Website title is required" }, { status: 400 });
    }

    if (!body.slug || typeof body.slug !== "string") {
      return NextResponse.json({ error: "Subdomain slug is required" }, { status: 400 });
    }

    const service = new SiteService();
    const result = await service.createSite({
      organizationId: tenantId,
      branchId: body.branchId,
      title: body.title,
      slug: body.slug,
      primaryLocale: body.primaryLocale || "en",
      timezone: body.timezone || "Asia/Kolkata",
      brandName: body.brandName || body.title,
      initialTemplate: body.initialTemplate || "hero_starter",
    });

    return NextResponse.json(
      {
        success: true,
        site: {
          id: result.site.id,
          title: result.site.title,
          slug: result.site.slug,
          status: result.site.status,
        },
        homePage: {
          id: result.homePage.id,
          title: result.homePage.title,
          slug: result.homePage.slug,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to provision site" },
      { status: 500 }
    );
  }
}
