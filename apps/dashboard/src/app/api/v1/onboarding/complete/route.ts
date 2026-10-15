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

const completeSchema = z
  .object({
    selectedApps: z.array(z.string().trim().min(1)).optional(),
  })
  .optional();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Active session is required to complete onboarding.",
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
    const parseResult = completeSchema?.safeParse(body);
    const bodyApps = parseResult?.success ? parseResult.data?.selectedApps : undefined;

    // Load user and organizations
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        organizations: {
          include: { organization: true },
        },
        branchRoles: {
          include: { branch: true },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json(
        {
          type: "/errors/user-not-found",
          title: "Not Found",
          status: 404,
          detail: "User account could not be found.",
          code: "USER_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const userMetadata = (dbUser.metadata || {}) as Record<string, unknown>;
    const orgId =
      session.organizationId ||
      dbUser.organizations[0]?.organizationId;

    if (!orgId) {
      return NextResponse.json(
        {
          type: "/errors/missing-organization",
          title: "Bad Request",
          status: 400,
          detail: "User must create or be part of an organization before completing onboarding.",
          code: "MISSING_ORGANIZATION",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const rawMetaApps = Array.isArray(userMetadata.selected_apps)
      ? (userMetadata.selected_apps as string[])
      : [];
    const appsToInstall = bodyApps && bodyApps.length > 0 ? bodyApps : rawMetaApps.length > 0 ? rawMetaApps : ["website-builder"];

    // Execute atomic license provisioning and status update
    await prisma.$transaction(async (tx) => {
      // 1. Provision installed apps
      for (const appId of appsToInstall) {
        await tx.installedApp.upsert({
          where: {
            organizationId_appId: {
              organizationId: orgId,
              appId,
            },
          },
          create: {
            organizationId: orgId,
            appId,
            isEnabled: true,
          },
          update: {
            isEnabled: true,
          },
        });
      }

      // 2. Mark onboarding as COMPLETED and clear current step
      await tx.user.update({
        where: { id: session.userId },
        data: {
          metadata: {
            ...userMetadata,
            selected_apps: appsToInstall,
            onboarding_status: "COMPLETED",
            current_onboarding_step: null,
          },
        },
      });
    });

    const activeOrg = dbUser.organizations.find((o) => o.organizationId === orgId)?.organization;
    const activeBranch = dbUser.branchRoles.find((b) => b.organizationId === orgId)?.branch;

    // Issue updated session token reflecting COMPLETED onboarding status
    const updatedPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      userName: dbUser.name,
      organizationId: orgId,
      organizationName: activeOrg?.name || session.organizationName,
      activeBranchId: activeBranch?.id || session.activeBranchId,
      activeBranchName: activeBranch?.name || session.activeBranchName,
      role: session.role || "owner",
      permissions: session.permissions,
      themePreference: session.themePreference || "system",
      timestamp: Date.now(),
      onboardingStatus: "COMPLETED",
      currentOnboardingStep: null,
    });

    const token = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = NextResponse.json({
      success: true,
      onboardingStatus: "COMPLETED",
      installedApps: appsToInstall,
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
  } catch (error) {
    console.error("Error completing onboarding:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Failed to finalize workspace activation.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
