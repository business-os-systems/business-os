import { NextResponse } from "next/server";
import { z } from "zod";
import { PageService } from "@suite/website-builder/services";
import { resolveTenantContext } from "@/lib/tenant-context";
import { problemResponse } from "@/lib/problem-response";

const CreatePageBodySchema = z.object({
  title: z.string().min(1, "Page title is required"),
  slug: z.string().min(1, "Page slug is required"),
  isHomePage: z.boolean().default(false),
  draftAst: z.record(z.unknown()).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const service = new PageService();
    const pages = await service.listPages(tenantContext.organizationId, siteId);

    return NextResponse.json({ pages }, { status: 200 });
  } catch (err: unknown) {
    console.error("Error fetching CMS pages for site:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while fetching pages.",
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const rawBody = await request.json().catch(() => ({}));

    const parsed = CreatePageBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Invalid Page Creation Payload",
        detail: parsed.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const body = parsed.data;
    const title = body.title.trim();
    const cleanSlug = body.slug.trim().replace(/^\/+/, "");
    const slug = `/${cleanSlug}`;
    const isHomePage = body.isHomePage;

    const service = new PageService();
    const page = await service.createPage({
      organizationId: tenantContext.organizationId,
      siteId,
      title,
      slug,
      isHomePage,
      draftAst: body.draftAst,
    });

    return NextResponse.json({ success: true, page }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error creating CMS page for site:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while creating page.",
    });
  }
}
