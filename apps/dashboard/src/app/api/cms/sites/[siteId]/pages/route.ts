import { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { PageService } from "@suite/website-builder/services";
import { authorizeCmsRequest } from "@/lib/cms-request-guard";
import {
  problemResponse,
  successResponse,
  zodProblemResponse,
} from "@/lib/problem-response";
import { quotaAwareProblemResponse } from "@/lib/quota-problem";

const CreatePageBodySchema = z.object({
  title: z.string().min(1, "Page title is required"),
  slug: z.string().min(1, "Page slug is required"),
  isHomePage: z.boolean().default(false),
  draftAst: z.record(z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await authorizeCmsRequest(
    request,
    PERMISSIONS.WEBSITE_BUILDER.PAGES_READ
  );
  if (auth.kind === "denied") {
    return auth.response;
  }

  try {
    const { siteId } = await params;
    const service = new PageService();
    const pages = await service.listPages(auth.session.organizationId, siteId);

    return successResponse({ pages });
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
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await authorizeCmsRequest(
    request,
    PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE
  );
  if (auth.kind === "denied") {
    return auth.response;
  }

  try {
    const { siteId } = await params;
    const rawBody = await request.json().catch(() => ({}));

    const parsed = CreatePageBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return zodProblemResponse(parsed.error, {
        status: 400,
        code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
        title: "Invalid Page Creation Payload",
        detail: "The page creation payload is invalid.",
      });
    }

    const body = parsed.data;
    const title = body.title.trim();
    const cleanSlug = body.slug.trim().replace(/^\/+/, "");
    const slug = `/${cleanSlug}`;
    const isHomePage = body.isHomePage;

    const service = new PageService();
    const page = await service.createPage({
      organizationId: auth.session.organizationId,
      siteId,
      title,
      slug,
      isHomePage,
      draftAst: body.draftAst,
    });

    return successResponse({ page }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error creating CMS page for site:", err);
    return quotaAwareProblemResponse(err, {
      code: PLATFORM_ERROR_CODE.INTERNAL_ERROR,
      detail: "An unexpected error occurred while creating page.",
    });
  }
}
