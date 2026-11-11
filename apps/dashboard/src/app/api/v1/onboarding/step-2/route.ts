import { NextRequest, NextResponse } from "next/server";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
} from "@suite/auth";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import { saveOnboardingSelection } from "@/services/onboarding.service";

const step2Schema = z.object({
  selectedApps: z
    .array(z.string().trim().min(1))
    .min(1, "Please select at least one application to install"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const session = sessionResult.session;

    const body = await request.json().catch(() => null);
    const parseResult = step2Schema.safeParse(body);
    if (!parseResult.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Bad Request",
        detail: parseResult.error.errors[0]?.message || "Invalid application selection",
      });
    }

    const selected = await saveOnboardingSelection({
      userId: session.userId,
      selectedApps: parseResult.data.selectedApps,
    });

    const updatedPayload = encodeSessionPayload({
      userId: session.userId,
      email: selected.userEmail || session.email,
      userName: selected.userName || session.userName,
      organizationId: session.organizationId,
      organizationName: session.organizationName,
      activeBranchId: session.activeBranchId,
      activeBranchName: session.activeBranchName,
      role: session.role ?? "owner",
      permissions: session.permissions,
      themePreference: session.themePreference ?? "system",
      timestamp: Date.now(),
      onboardingStatus: "IN_PROGRESS",
      currentOnboardingStep: 3,
    });

    const token = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(true);
    const response = successResponse({
      success: true,
      nextStep: 3,
      redirectUrl: "/onboarding/step-3",
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
  } catch (error) {
    console.error("Error in onboarding step 2:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to persist application selection.",
    });
  }
}
