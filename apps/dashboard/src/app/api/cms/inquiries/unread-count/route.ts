import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { problemFromError, websiteBuilderAccessProblem } from "@/lib/website-builder-problem";
import { successResponse } from "@/lib/problem-response";
import { countTenantUnreadInquiries } from "@suite/website-builder/inquiries";

/** Unread count for the Inquiries navigation badge (FR-129). */
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
  try {
    const count = await countTenantUnreadInquiries(auth.session.organizationId);
    return successResponse({ count });
  } catch (error: unknown) {
    return problemFromError(error, request.nextUrl.pathname);
  }
}
