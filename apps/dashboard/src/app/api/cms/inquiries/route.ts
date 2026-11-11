import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { problemFromError, websiteBuilderAccessProblem } from "@/lib/website-builder-problem";
import { successResponse, zodProblemResponse } from "@/lib/problem-response";
import { listTenantInquiries } from "@suite/website-builder/inquiries";
import { inquiryListQuerySchema } from "@/components/inquiries/inquiries.contract";

function readQuery(request: NextRequest): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of ["siteId", "status", "cursor", "limit"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) {
      query[key] = value;
    }
  }
  return query;
}

/** Lists this workspace's inquiries with a site and status filter (FR-047, FR-127). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return auth.response;
  }
  const access = await evaluateWebsiteBuilderAccess({
    actor: auth.session,
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  });
  if (access.kind === "denied") {
    return websiteBuilderAccessProblem(access.reason, request.nextUrl.pathname);
  }
  const parsed = inquiryListQuerySchema.safeParse(readQuery(request));
  if (!parsed.success) {
    return zodProblemResponse(parsed.error, {
      status: 400,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      title: "Invalid inquiries query",
      detail: "The inquiries query parameters are invalid.",
    });
  }
  try {
    const page = await listTenantInquiries({
      organizationId: auth.session.organizationId,
      ...(parsed.data.siteId === undefined ? {} : { siteId: parsed.data.siteId }),
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
      ...(parsed.data.cursor === undefined ? {} : { cursor: parsed.data.cursor }),
      limit: parsed.data.limit,
    });
    return successResponse(page);
  } catch (error: unknown) {
    return problemFromError(error, request.nextUrl.pathname);
  }
}
