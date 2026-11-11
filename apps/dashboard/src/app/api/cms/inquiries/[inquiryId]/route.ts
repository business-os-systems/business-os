import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import {
  canRevealInquiryPii,
  problemFromError,
  websiteBuilderAccessProblem,
} from "@/lib/website-builder-problem";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/problem-response";
import {
  changeTenantInquiryStatus,
  eraseTenantInquiry,
  getTenantInquiry,
} from "@suite/website-builder/inquiries";
import { inquiryStatusUpdateSchema } from "@/components/inquiries/inquiries.contract";

async function readInquiryAccess(request: NextRequest, capability: string) {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return { kind: "denied" as const, response: auth.response };
  }
  const access = await evaluateWebsiteBuilderAccess({ actor: auth.session, capability });
  if (access.kind === "denied") {
    return {
      kind: "denied" as const,
      response: websiteBuilderAccessProblem(access.reason, request.nextUrl.pathname),
    };
  }
  return { kind: "granted" as const, auth, access };
}

function notFound(request: NextRequest): NextResponse {
  return problemResponse({
    status: 404,
    code: PLATFORM_ERROR_CODE.NOT_FOUND,
    title: "Inquiry not found",
    detail: "The requested inquiry was not found in this workspace.",
    instance: request.nextUrl.pathname,
  });
}

/** Reads one inquiry; revealPii requires cms:leads:pii and is audited (FR-048). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ inquiryId: string }> }
): Promise<NextResponse> {
  const granted = await readInquiryAccess(request, PERMISSIONS.WEBSITE_BUILDER.LEADS_READ);
  if (granted.kind === "denied") {
    return granted.response;
  }
  const revealPii = request.nextUrl.searchParams.get("revealPii") === "true";
  if (revealPii && !canRevealInquiryPii(granted.access.permissions)) {
    return problemResponse({
      status: 403,
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      title: "Capability denied",
      detail: "Reading inquiry contact details requires the cms:leads:pii capability.",
      instance: request.nextUrl.pathname,
    });
  }
  try {
    const { inquiryId } = await context.params;
    const inquiry = await getTenantInquiry({
      organizationId: granted.auth.session.organizationId,
      inquiryId,
      revealPii,
      actorUserId: granted.auth.session.userId,
    });
    return inquiry === null ? notFound(request) : successResponse({ inquiry });
  } catch (error: unknown) {
    return problemFromError(error, request.nextUrl.pathname);
  }
}

/** Moves an inquiry through NEW -> READ -> ARCHIVED | SPAM. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ inquiryId: string }> }
): Promise<NextResponse> {
  const granted = await readInquiryAccess(request, PERMISSIONS.WEBSITE_BUILDER.LEADS_READ);
  if (granted.kind === "denied") {
    return granted.response;
  }
  const parsed = inquiryStatusUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodProblemResponse(parsed.error, {
      status: 400,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      title: "Invalid inquiry status",
      detail: "Only READ, ARCHIVED or SPAM is a valid inquiry status change.",
    });
  }
  try {
    const { inquiryId } = await context.params;
    const inquiry = await changeTenantInquiryStatus({
      organizationId: granted.auth.session.organizationId,
      inquiryId,
      status: parsed.data.status,
      actorUserId: granted.auth.session.userId,
    });
    return inquiry === null ? notFound(request) : successResponse({ inquiry });
  } catch (error: unknown) {
    return problemFromError(error, request.nextUrl.pathname);
  }
}

/** Erases one inquiry before retention; requires cms:leads:pii (FR-049). */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ inquiryId: string }> }
): Promise<NextResponse> {
  const granted = await readInquiryAccess(request, PERMISSIONS.WEBSITE_BUILDER.LEADS_PII);
  if (granted.kind === "denied") {
    return granted.response;
  }
  try {
    const { inquiryId } = await context.params;
    const erased = await eraseTenantInquiry({
      organizationId: granted.auth.session.organizationId,
      inquiryId,
      actorUserId: granted.auth.session.userId,
    });
    return erased ? successResponse({ erased: true }) : notFound(request);
  } catch (error: unknown) {
    return problemFromError(error, request.nextUrl.pathname);
  }
}
