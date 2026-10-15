import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
} from "@suite/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Authentication session required.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isValid = await verifySessionToken(sessionCookie);
    if (!isValid) {
      return NextResponse.json(
        {
          type: "/errors/invalid-session",
          title: "Invalid Session",
          status: 401,
          detail: "Session token is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const sessionPayload = decodeSessionPayload(sessionCookie);
    if (!sessionPayload?.userId || !sessionPayload?.organizationId) {
      return NextResponse.json(
        {
          type: "/errors/invalid-payload",
          title: "Bad Request",
          status: 400,
          detail: "Active organization context is required.",
          code: "ORGANIZATION_REQUIRED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // 1. Check user verification status from PostgreSQL (Zero Static Data law)
    const user = await prisma.user.findUnique({
      where: { id: sessionPayload.userId },
      select: { id: true, emailVerified: true },
    });

    if (!user || !user.emailVerified) {
      return NextResponse.json(
        {
          type: "/errors/email-verification-required",
          title: "Email Verification Required",
          status: 403,
          detail:
            "You must verify your email address before installing new applications to your workspace.",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id: appId } = await params;
    if (!appId) {
      return NextResponse.json(
        {
          type: "/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "App ID is required.",
          code: "APP_ID_REQUIRED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // 2. Install or enable application in the organization
    const installed = await prisma.installedApp.upsert({
      where: {
        organizationId_appId: {
          organizationId: sessionPayload.organizationId,
          appId,
        },
      },
      update: {
        isEnabled: true,
      },
      create: {
        organizationId: sessionPayload.organizationId,
        appId,
        version: "1.0.0",
        isEnabled: true,
        settings: {
          installedBy: sessionPayload.userId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Application installed successfully.",
      appId: installed.appId,
      installedAt: installed.installedAt,
    });
  } catch (error) {
    console.error("Error installing application:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while installing the application.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
