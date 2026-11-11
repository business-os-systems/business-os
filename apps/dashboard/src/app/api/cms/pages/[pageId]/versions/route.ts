import { NextRequest } from "next/server";
import { PERMISSIONS } from "@suite/core";
import { PageService } from "@suite/website-builder/services";
import { authorizeCmsRequest } from "@/lib/cms-request-guard";
import { problemResponse, successResponse } from "@/lib/problem-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const auth = await authorizeCmsRequest(
    request,
    PERMISSIONS.WEBSITE_BUILDER.PAGES_READ
  );
  if (auth.kind === "denied") {
    return auth.response;
  }

  try {
    const { pageId } = await params;
    const service = new PageService();
    const versions = await service.listPageVersions(auth.session.organizationId, pageId);

    return successResponse({ versions });
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
