import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { getUserOnboardingState, extractEffectivePermissions, recordSecurityAuditLog } from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";
import { isProduction } from "@/lib/env";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";

const PasskeyVerifySchema = z.object({
  id: z.string({ required_error: "Credential ID is required" }).min(1, "Credential ID is required"),
  rawId: z.string().optional(),
  type: z.string().optional(),
  response: z.record(z.unknown()).optional(),
  turnstileToken: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = PasskeyVerifySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message ?? "Invalid passkey payload",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id, turnstileToken } = parseResult.data;

    // Verify Cloudflare Turnstile bot token if provided or in production
    if (isProduction || turnstileToken) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
      if (!turnstileResult.success) {
        return NextResponse.json(
          {
            type: "/errors/bot-verification-failed",
            title: "Forbidden",
            status: 403,
            detail: "Security verification failed. Please complete the security check and try again.",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } }
        );
      }
    }

    // Look up registered passkey and associated user profile
    const passkey = await prisma.passkey.findUnique({
      where: { credentialID: id },
      include: {
        user: {
          include: {
            accounts: true,
            organizations: {
              orderBy: { createdAt: "asc" },
              include: {
                organization: true,
              },
            },
            branchRoles: {
              orderBy: { createdAt: "asc" },
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
                branch: true,
              },
            },
          },
        },
      },
    });

    if (!passkey || !passkey.user) {
      return NextResponse.json(
        {
          type: "/errors/invalid-credentials",
          title: "Unauthorized",
          status: 401,
          detail: "Passkey credential not recognized or unregistered.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Increment credential use counter
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: { increment: 1 } },
    });

    const dbUser = passkey.user;
    const onboardingState = getUserOnboardingState(dbUser.metadata);
    const onboardingStatus = onboardingState.onboardingStatus;
    const currentOnboardingStep = onboardingState.currentOnboardingStep ?? undefined;
    const themePreference = onboardingState.themePreference;

    const membership = dbUser.organizations[0];
    const organization = membership?.organization;
    const branchRole = dbUser.branchRoles[0];
    const roleName = branchRole?.role?.name || (onboardingStatus === "IN_PROGRESS" ? "owner" : "member");
    const roleSlug = branchRole?.role?.slug;
    const branchName = branchRole?.branch?.name ?? undefined;
    const branchId = branchRole?.branchId ?? undefined;

    // Check workspace membership if onboarding is completed
    if (onboardingStatus !== "IN_PROGRESS" && !organization) {
      return NextResponse.json(
        {
          type: "/errors/workspace-access-denied",
          title: "Forbidden",
          status: 403,
          detail: "Account is not associated with an active enterprise workspace.",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const userPermissions = extractEffectivePermissions(dbUser.branchRoles, { branchId });

    const hasMultipleWorkspaces =
      onboardingStatus === "COMPLETED" && dbUser.organizations.length > 1;

    const redirectUrl = hasMultipleWorkspaces
      ? "/choose-tenant"
      : resolvePostLoginRoute({
          permissions: userPermissions,
          onboardingStatus,
          currentOnboardingStep,
        });

    const rawPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      organizationId: organization?.id,
      organizationName: organization?.name,
      role: roleName,
      permissions: userPermissions,
      userName: dbUser.name,
      activeBranchId: branchId,
      activeBranchName: branchName,
      themePreference,
      timestamp: Date.now(),
      onboardingStatus,
      currentOnboardingStep,
    });

    const token = await signSessionToken(rawPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    // Record security audit trail entry (SPEC-04 / OWASP ASVS 4.0.3 Non-Repudiation)
    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: dbUser.id,
      action: AUDIT_EVENT_TYPES.AUTH_PASSKEY_VERIFIED,
      ipAddress: clientIp,
      userAgent,
      metadata: {
        passkeyId: passkey.id,
        credentialId: passkey.credentialID,
        deviceType: passkey.deviceType,
      },
    });

    const response = NextResponse.json({
      success: true,
      redirectUrl,
      themePreference,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleName,
        roleSlug: roleSlug || roleName,
        permissions: userPermissions,
        organizationId: organization?.id,
        organizationName: organization?.name,
        onboardingStatus,
        currentOnboardingStep,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Failed to verify passkey",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
