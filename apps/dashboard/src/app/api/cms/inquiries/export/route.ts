import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { problemFromError, websiteBuilderAccessProblem } from "@/lib/website-builder-problem";
import { zodProblemResponse } from "@/lib/problem-response";
import { exportTenantInquiries } from "@suite/website-builder/inquiries";
import { inquiryExportQuerySchema } from "@/components/inquiries/inquiries.contract";

function readQuery(request: NextRequest): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of ["siteId", "status"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) {
      query[key] = value;
    }
  }
  return query;
}

/**
 * Downloads the filtered inquiries as CSV (FR-047). The file contains contact
 * fields, so the route requires cms:leads:pii; the domain layer writes the PII
 * audit row before any row is returned (FR-048).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return auth.response;
  }
  const access = await evaluateWebsiteBuilderAccess({
    actor: auth.session,
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_PII,
  });
  if (access.kind === "denied") {
    return websiteBuilderAccessProblem(access.reason, request.nextUrl.pathname);
  }
  const parsed = inquiryExportQuerySchema.safeParse(readQuery(request));
  if (!parsed.success) {
    return zodProblemResponse(parsed.error, {
      status: 400,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      title: "Invalid inquiry export query",
      detail: "The inquiry export filters are invalid.",
    });
  }
  try {
    const result = await exportTenantInquiries({
      organizationId: auth.session.organizationId,
      ...(parsed.data.siteId === undefined ? {} : { siteId: parsed.data.siteId }),
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
      actorUserId: auth.session.userId,
    });
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    return problemFromError(error, request.nextUrl.pathname);
  }
}
