import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@suite/db";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  getUserOnboardingState,
  mergeUserOnboardingState,
  extractEffectivePermissions,
  ONBOARDING_STATUS,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { getAppManifest, APP_MANIFESTS } from "@suite/core";
import { z } from "zod";


const completeSchema = z
  .object({
    selectedApps: z.array(z.string().trim().min(1)).optional(),
  })
  .optional();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const session = sessionResult.session;

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
          include: {
            branch: true,
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
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

    const onboardingState = getUserOnboardingState(dbUser.metadata);
    const appsToInstall =
      bodyApps && bodyApps.length > 0
        ? bodyApps
        : onboardingState.selectedApps;

    // Execute atomic license provisioning and status update
    await prisma.$transaction(async (tx) => {
      // 1. Provision installed apps with complete manifest metadata
      for (const appId of appsToInstall) {
        const manifest = getAppManifest(appId) || APP_MANIFESTS["website-builder"];
        const appSettings = {
          code: manifest?.code ?? "App 01",
          name: manifest?.name ?? appId,
          title: manifest?.title ?? appId,
          href: manifest?.href ?? `/${appId}`,
          iconName: manifest?.iconName ?? "sites",
          description: manifest?.description ?? "Launch and manage application environment.",
          permission: manifest?.permission ?? `${appId}:read`,
          installedBy: session.userId,
        };

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
            version: manifest?.version ?? "1.0.0",
            isEnabled: true,
            settings: appSettings,
          },
          update: {
            isEnabled: true,
            settings: appSettings,
          },
        });
      }


      // 2. Mark onboarding as COMPLETED and clear current step
      const updatedMetadata = mergeUserOnboardingState(dbUser.metadata, {
        selectedApps: appsToInstall,
        onboardingStatus: ONBOARDING_STATUS.COMPLETED,
        currentOnboardingStep: null,
      });

      await tx.user.update({
        where: { id: session.userId },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue,
        },
      });
    });

    const activeOrg = dbUser.organizations.find((o) => o.organizationId === orgId)?.organization;
    const activeBranchRole = dbUser.branchRoles.find((b) => b.organizationId === orgId);
    const activeBranch = activeBranchRole?.branch;
    const activeRole = activeBranchRole?.role;

    // Dynamically resolve permissions from database relations
    const extractedPermissions = extractEffectivePermissions(dbUser.branchRoles || [], {
      branchId: activeBranch?.id,
    });
    const userPermissions =
      extractedPermissions.length > 0
        ? extractedPermissions
        : (session.permissions || []);

    // Issue updated session token reflecting COMPLETED onboarding status
    const updatedPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      userName: dbUser.name,
      organizationId: orgId,
      organizationName: activeOrg?.name || session.organizationName,
      activeBranchId: activeBranch?.id || session.activeBranchId,
      activeBranchName: activeBranch?.name || session.activeBranchName,
      role: activeRole?.name || session.role,
      permissions: userPermissions,
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
