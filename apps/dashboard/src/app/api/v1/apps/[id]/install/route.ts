import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";

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
    const organizationId = sessionPayload.organizationId!;

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

    // 2. Enforce Capability-Based RBAC Authorization (Purely Permission-Driven, Zero Static Role Checks)
    const requiredPermission = PERMISSIONS.APPS.INSTALL;
    const sessionPermissions = sessionPayload.permissions ?? [];
    const hasSessionPermission = hasPermission(sessionPermissions, requiredPermission);

    if (!hasSessionPermission) {
      const userBranchRoles = await prisma.userBranchRole.findMany({
        where: {
          userId: sessionPayload.userId,
          organizationId,
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      const dbPermissionActions = userBranchRoles.flatMap(
        (ubr) =>
          ubr.role?.permissions?.map((rp) => rp.permission?.action).filter(Boolean) as string[] ?? []
      );

      const hasDynamicDbPermission = hasPermission(dbPermissionActions, requiredPermission);

      if (!hasDynamicDbPermission) {
        return NextResponse.json(
          {
            type: "/errors/forbidden",
            title: "Forbidden",
            status: 403,
            detail: "You do not have permission to install applications in this workspace.",
            code: "INSUFFICIENT_PERMISSIONS",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } }
        );
      }
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
          organizationId,
          appId,
        },
      },
      update: {
        isEnabled: true,
      },
      create: {
        organizationId,
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
