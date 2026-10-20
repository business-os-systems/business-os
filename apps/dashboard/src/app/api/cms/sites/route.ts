import { NextResponse } from "next/server";
import { z } from "zod";
import { SiteService } from "@suite/website-builder/services";
import { resolveTenantContext } from "@/lib/tenant-context";
import { problemResponse } from "@/lib/problem-response";

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
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const service = new SiteService();
    const sites = await service.listSites(tenantContext.organizationId);
    return NextResponse.json({ sites }, { status: 200 });
  } catch (err: unknown) {
    console.error("Error listing CMS sites:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while fetching sites.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const rawBody = await request.json().catch(() => ({}));

    const parsed = CreateSiteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Invalid Site Provisioning Payload",
        detail: parsed.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const body = parsed.data;
    const service = new SiteService();
    const result = await service.createSite({
      organizationId: tenantContext.organizationId,
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
    console.error("Error provisioning CMS site:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while provisioning site.",
    });
  }
}
