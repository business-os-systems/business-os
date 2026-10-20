import { NextResponse } from "next/server";
import { z } from "zod";
import { SiteService } from "@suite/website-builder/services";

const CreateSiteSchema = z.object({
  title: z.string().min(1, "Website title is required"),
  slug: z.string().min(1, "Subdomain slug is required"),
  branchId: z.string().optional(),
  primaryLocale: z.string().default("en"),
  timezone: z.string().default("Asia/Kolkata"),
  brandName: z.string().optional(),
  initialTemplate: z.enum(["blank", "hero_starter"]).default("hero_starter"),
});

export async function GET(request: Request) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Organization context header (x-tenant-id) is required to list sites.",
        },
        { status: 401 }
      );
    }
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
    const tenantId = request.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Organization context header (x-tenant-id) is required to create a site.",
        },
        { status: 401 }
      );
    }
    const rawBody = await request.json().catch(() => ({}));

    const parsed = CreateSiteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          code: "VALIDATION_ERROR",
          title: "Invalid Site Provisioning Payload",
          status: 400,
          detail: parsed.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const service = new SiteService();
    const result = await service.createSite({
      organizationId: tenantId,
      branchId: body.branchId,
      title: body.title,
      slug: body.slug,
      primaryLocale: body.primaryLocale,
      timezone: body.timezone,
      brandName: body.brandName ?? body.title,
      initialTemplate: body.initialTemplate,
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
