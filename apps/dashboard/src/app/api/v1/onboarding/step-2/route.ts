import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
} from "@suite/auth/session";
import { isProduction } from "@/lib/env";
import { z } from "zod";

const step2Schema = z.object({
  selectedApps: z
    .array(z.string().trim().min(1))
    .min(1, "Please select at least one application to install"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Active session is required to perform onboarding.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isValid = await verifySessionToken(sessionCookie);
    if (!isValid) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Session token signature is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const session = decodeSessionPayload(sessionCookie);
    if (!session || !session.userId) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Session token payload is invalid.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

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

    const currentMeta = (dbUser?.metadata || {}) as Record<string, unknown>;
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        metadata: {
          ...currentMeta,
          selected_apps: selectedApps,
          current_onboarding_step: 3,
        },
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
