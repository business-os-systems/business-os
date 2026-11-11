import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  type SessionPayload,
} from "@suite/auth";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import { completeOnboarding } from "@/services/onboarding.service";

const completeSchema = z
  .object({
    selectedApps: z.array(z.string().trim().min(1)).optional(),
  })
  .optional();

async function buildCompletionResponse(
  data: Extract<
    Awaited<ReturnType<typeof completeOnboarding>>,
    { status: "completed" }
  >["data"],
  session: SessionPayload
): Promise<NextResponse> {
  const permissions =
    data.permissions.length > 0 ? data.permissions : [...(session.permissions ?? [])];
  const updatedPayload = encodeSessionPayload({
    userId: data.userId,
    email: data.userEmail,
    userName: data.userName,
    organizationId: data.organizationId,
    organizationName: data.organizationName ?? session.organizationName,
    activeBranchId: data.activeBranchId ?? session.activeBranchId,
    activeBranchName: data.activeBranchName ?? session.activeBranchName,
    role: data.roleName ?? session.role,
    permissions,
    themePreference: session.themePreference ?? "system",
    timestamp: Date.now(),
    onboardingStatus: "COMPLETED",
    currentOnboardingStep: null,
  });

  const token = await signSessionToken(updatedPayload);
  const cookieOptions = createSessionCookieOptions(true);
  const response = successResponse({
    success: true,
    onboardingStatus: "COMPLETED",
    installedApps: data.installedApps,
    redirectUrl: "/dashboard",
  });
  response.cookies.set({
    name: cookieOptions.name,
    value: token,
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const session = sessionResult.session;

    const body = await request.json().catch(() => null);
    const parseResult = completeSchema.safeParse(body);
    const selectedApps = parseResult.success ? parseResult.data?.selectedApps : undefined;

    const result = await completeOnboarding({
      userId: session.userId,
      sessionOrganizationId: session.organizationId,
      selectedApps,
    });

    if (result.status === "user_not_found") {
      return problemResponse({
        status: 404,
        code: "USER_NOT_FOUND",
        title: "Not Found",
        detail: "User account could not be found.",
      });
    }
    if (result.status === "missing_organization") {
      return problemResponse({
        status: 400,
        code: "MISSING_ORGANIZATION",
        title: "Bad Request",
        detail: "User must create or be part of an organization before completing onboarding.",
      });
    }

    return await buildCompletionResponse(result.data, session);
  } catch (error) {
    console.error("Error completing onboarding:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to finalize workspace activation.",
    });
  }
}
