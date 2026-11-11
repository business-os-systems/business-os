import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { QuotaExceededError } from "@suite/core/errors";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
} from "@suite/auth";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import {
  acceptInvitation,
  getInvitationDetails,
  type AcceptInvitationResult,
  type InvitationDetailsResult,
} from "@/services/invitation.service";

const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .optional(),
  name: z.string().trim().min(2, "Full name must be at least 2 characters").optional(),
});

function mapDetailsProblem(
  result: Exclude<InvitationDetailsResult, { status: "valid" }>
): NextResponse {
  switch (result.status) {
    case "not_found":
      return problemResponse({
        status: 404,
        code: "INVITATION_NOT_FOUND",
        title: "Not Found",
        detail: "Invitation not found or has already been consumed.",
      });
    case "already_accepted":
      return problemResponse({
        status: 409,
        code: "INVITATION_ACCEPTED",
        title: "Invitation Already Accepted",
        detail:
          "This invitation has already been accepted. You can log in directly to access your workspace.",
        extra: { isAccepted: true },
      });
    case "inactive":
      return problemResponse({
        status: 409,
        code: "INVITATION_INACTIVE",
        title: "Conflict",
        detail: `Invitation is no longer active (status: ${result.invitationStatus}).`,
      });
    case "expired":
      return problemResponse({
        status: 410,
        code: "INVITATION_EXPIRED",
        title: "Gone",
        detail:
          "This invitation link has expired. Please request a new invitation from your administrator.",
      });
    case "revoked":
      return problemResponse({
        status: 403,
        code: "INVITATION_REVOKED",
        title: "Access Revoked",
        detail:
          "Your workspace access has been suspended or revoked. Contact your organization administrator.",
      });
  }
}

function mapAcceptProblem(
  result: Exclude<AcceptInvitationResult, { status: "accepted" }>
): NextResponse {
  switch (result.status) {
    case "not_found":
      return problemResponse({
        status: 404,
        code: "INVITATION_NOT_FOUND",
        title: "Not Found",
        detail: "Invitation not found or has already been consumed.",
      });
    case "already_accepted":
      return problemResponse({
        status: 409,
        code: "INVITATION_ACCEPTED",
        title: "Invitation Already Accepted",
        detail:
          "This invitation link has already been used and expired. Please sign in directly.",
        extra: { isAccepted: true },
      });
    case "inactive":
      return problemResponse({
        status: 409,
        code: "INVITATION_INACTIVE",
        title: "Conflict",
        detail: `Invitation is no longer active (status: ${result.invitationStatus}).`,
      });
    case "expired":
      return problemResponse({
        status: 410,
        code: "INVITATION_EXPIRED",
        title: "Gone",
        detail: "This invitation link has expired. Please request a new invitation.",
      });
    case "revoked":
      return problemResponse({
        status: 403,
        code: "INVITATION_REVOKED",
        title: "Access Revoked",
        detail:
          "Your workspace access has been suspended or revoked. Contact your organization administrator.",
      });
    case "password_required":
      return problemResponse({
        status: 422,
        code: "PASSWORD_REQUIRED",
        title: "Password Required",
        detail: "A password is required to set up your account and join the workspace.",
      });
    case "email_mismatch":
      return problemResponse({
        status: 403,
        code: "INVITATION_EMAIL_MISMATCH",
        title: "Forbidden",
        detail: `This invitation was issued to ${result.invitationEmail}. You are currently signed in as ${result.sessionEmail}. Please sign in to the matching account or accept in a private window.`,
      });
  }
}

async function buildAcceptedResponse(
  result: Extract<AcceptInvitationResult, { status: "accepted" }>
): Promise<NextResponse> {
  const updatedPayload = encodeSessionPayload({
    userId: result.userId,
    email: result.userEmail,
    userName: result.userName,
    organizationId: result.organizationId,
    organizationName: result.organizationName,
    role: result.roleSlug,
    activeBranchId: result.assignedBranchId,
    permissions: result.permissions,
    themePreference: "system",
    timestamp: Date.now(),
    onboardingStatus: "COMPLETED",
    currentOnboardingStep: null,
  });

  const tokenJwt = await signSessionToken(updatedPayload);
  const cookieOptions = createSessionCookieOptions(true);

  const response = NextResponse.json({
    success: true,
    message: `Successfully joined ${result.organizationName}`,
    redirectUrl: "/dashboard",
  });
  response.cookies.set({
    name: cookieOptions.name,
    value: tokenJwt,
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Bad Request",
        detail: "Invitation token parameter is required.",
      });
    }

    const result = await getInvitationDetails(token);
    if (result.status !== "valid") {
      return mapDetailsProblem(result);
    }

    const details = result.details;
    return successResponse({
      isValid: true,
      token: details.token,
      email: details.email,
      name: details.name,
      organizationName: details.organizationName,
      roleName: details.roleName,
      branchName: details.branchName,
      hasPassword: details.hasPassword,
      expiresAt: details.expiresAt,
    });
  } catch (error) {
    console.error("Error fetching invitation details:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to resolve invitation details.",
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const parseResult = acceptInvitationSchema.safeParse(body);
    if (!parseResult.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Bad Request",
        detail: parseResult.error.errors[0]?.message || "Invalid invitation input.",
        extra: {
          errors: parseResult.error.errors.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    const sessionResult = await getAuthenticatedSession(request);
    const session = sessionResult.ok
      ? {
          userId: sessionResult.session.userId,
          email: sessionResult.session.email,
          userName: sessionResult.session.userName,
        }
      : null;

    const result = await acceptInvitation({
      token: parseResult.data.token,
      password: parseResult.data.password,
      name: parseResult.data.name,
      session,
    });

    if (result.status !== "accepted") {
      return mapAcceptProblem(result);
    }
    return await buildAcceptedResponse(result);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return problemResponse({
        status: 409,
        code: PLATFORM_ERROR_CODE.QUOTA_EXCEEDED,
        title: "Workspace Member Limit Reached",
        detail:
          "This workspace cannot accept another member right now. Contact the workspace administrator.",
      });
    }
    console.error("Error accepting invitation:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to accept organization invitation.",
    });
  }
}
