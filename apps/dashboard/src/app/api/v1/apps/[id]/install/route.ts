import { NextRequest, NextResponse } from "next/server";
import { problemResponse, successResponse } from "@/lib/api-response";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { installApplication } from "@/services/installed-apps.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request, { requireOrganization: true });
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const sessionPayload = sessionResult.session;

    const { id: appId } = await params;
    if (!appId) {
      return problemResponse({
        type: "/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "App ID is required.",
        code: "APP_ID_REQUIRED",
      });
    }

    const result = await installApplication({
      organizationId: sessionPayload.organizationId,
      appId,
      userId: sessionPayload.userId,
      sessionPermissions: sessionPayload.permissions ?? [],
    });

    if (result.status === "email_unverified") {
      return problemResponse({
        type: "/errors/email-verification-required",
        title: "Email Verification Required",
        status: 403,
        detail:
          "You must verify your email address before installing new applications to your workspace.",
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
    }
    if (result.status === "forbidden") {
      return problemResponse({
        type: "/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "You do not have permission to install applications in this workspace.",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    return successResponse({
      success: true,
      message: "Application installed successfully.",
      appId: result.appId,
      installedAt: result.installedAt,
    });
  } catch (error) {
    console.error("Error installing application:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while installing the application.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
