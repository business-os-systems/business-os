import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@suite/db";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  mergeUserOnboardingState,
  ONBOARDING_STATUS,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { z } from "zod";

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
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.errors[0]?.message || "Invalid application selection",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { selectedApps } = parseResult.data;

    // Update user metadata with selected applications and step 3
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { metadata: true, email: true, name: true },
    });

    const updatedMetadata = mergeUserOnboardingState(dbUser?.metadata, {
      selectedApps,
      currentOnboardingStep: 3,
      onboardingStatus: ONBOARDING_STATUS.IN_PROGRESS,
    });

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        metadata: updatedMetadata as Prisma.InputJsonValue,
      },
    });

    // Re-issue updated session token with step 3
    const updatedPayload = encodeSessionPayload({
      userId: session.userId,
      email: dbUser?.email || session.email,
      userName: dbUser?.name || session.userName,
      organizationId: session.organizationId,
      organizationName: session.organizationName,
      activeBranchId: session.activeBranchId,
      activeBranchName: session.activeBranchName,
      role: session.role || "owner",
      permissions: session.permissions,
      themePreference: session.themePreference || "system",
      timestamp: Date.now(),
      onboardingStatus: "IN_PROGRESS",
      currentOnboardingStep: 3,
    });

    const token = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = NextResponse.json({
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
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Failed to persist application selection.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
