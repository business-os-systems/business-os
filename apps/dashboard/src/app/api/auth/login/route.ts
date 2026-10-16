import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { verifyPassword } from "@suite/auth/password";
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

const LoginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
  keepSignedIn: z.boolean().optional().default(false),
  turnstileToken: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = LoginSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { email, password, keepSignedIn, turnstileToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Verify Cloudflare Turnstile bot token in production or when token provided
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

    // Verify user in PostgreSQL database
    const dbUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
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
    });

    if (!dbUser) {
      return NextResponse.json(
        {
          type: "/errors/invalid-credentials",
          title: "Unauthorized",
          status: 401,
          detail: "Invalid email or password. Please check your credentials.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Verify credential account and password exist
    const credentialAccount = dbUser.accounts.find((a) => a.providerId === "credential");
    if (!credentialAccount || !credentialAccount.password) {
      return NextResponse.json(
        {
          type: "/errors/invalid-credentials",
          title: "Unauthorized",
          status: 401,
          detail: "Invalid email or password. Please check your credentials.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isPasswordValid = await verifyPassword(password, credentialAccount.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        {
          type: "/errors/invalid-credentials",
          title: "Unauthorized",
          status: 401,
          detail: "Invalid email or password. Please check your credentials.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

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

    // Extract dynamic permissions scoped to the active branch or organization-wide assignments
    const userPermissions = extractEffectivePermissions(dbUser.branchRoles, { branchId });

    const hasMultipleWorkspaces =
      onboardingStatus === "COMPLETED" && dbUser.organizations.length > 1;

    // Resolve post-login route based on dynamic permissions and lifecycle state
    const redirectUrl = hasMultipleWorkspaces
      ? "/choose-tenant"
      : resolvePostLoginRoute({
          permissions: userPermissions,
          onboardingStatus,
          currentOnboardingStep,
        });

    // Generate cryptographically signed session token with verified tenant payload
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
    const cookieOptions = createSessionCookieOptions(isProduction, keepSignedIn);

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

    const userAgent = request.headers.get("user-agent");
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: dbUser.id,
      action: AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      ipAddress: clientIp,
      userAgent,
      metadata: { method: "password" },
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Failed to authenticate session",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
