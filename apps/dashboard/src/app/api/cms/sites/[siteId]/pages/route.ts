import { NextResponse } from "next/server";
import { z } from "zod";
import { PageService } from "@suite/website-builder/services";

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
    const tenantId = request.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Organization context header (x-tenant-id) is required to list pages.",
        },
        { status: 401 }
      );
    }

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const tenantId = request.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Organization context header (x-tenant-id) is required to create a page.",
        },
        { status: 401 }
      );
    }
    const rawBody = await request.json().catch(() => ({}));

    const parsed = CreatePageBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "VALIDATION_ERROR",
          title: "Invalid Page Creation Payload",
          status: 400,
          detail: parsed.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const title = body.title.trim();
    const cleanSlug = body.slug.trim().replace(/^\/+/, "");
    const slug = `/${cleanSlug}`;
    const isHomePage = body.isHomePage;

    const service = new PageService();
    const page = await service.createPage({
      organizationId: tenantId,
      siteId,
      title,
      slug,
      isHomePage,
      draftAst: body.draftAst,
    });

    return NextResponse.json({ success: true, page }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create page" },
      { status: 500 }
    );
  }
}
