import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import {
  linkOAuthAccountWithPassword,
  verifyAccountLinkingTicket,
  getBetterAuthSecret,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  getUserOnboardingState,
  extractEffectivePermissions,
  recordSecurityAuditLog,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";


const linkAccountSchema = z.object({
  ticket: z.string().min(1, "Account linking ticket is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Validates and inspects an OAuth linking ticket.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const ticket = searchParams.get("ticket");

  if (!ticket) {
    return NextResponse.json(
      {
        type: "/errors/invalid-ticket",
        title: "Bad Request",
        status: 400,
        detail: "Ticket query parameter is required.",
        code: "INVALID_TICKET",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } }
    );
  }

  const payload = verifyAccountLinkingTicket(ticket, getBetterAuthSecret());
  if (!payload) {
    return NextResponse.json(
      {
        type: "/errors/invalid-ticket",
        title: "Invalid or Expired Ticket",
        status: 400,
        detail: "The account linking ticket is invalid or has expired.",
        code: "INVALID_TICKET",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } }
    );
  }

  return NextResponse.json({
    valid: true,
    email: payload.email,
    providerId: payload.providerId,
    name: payload.name,
    image: payload.image,
  });
}

/**
 * Verifies password and links OAuth provider to existing user account.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = linkAccountSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message || "Invalid linking parameters",
          code: "VALIDATION_FAILED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { ticket, password } = parseResult.data;
    const secretKey = getBetterAuthSecret();

    // Verify ticket and link account with password
    const result = await linkOAuthAccountWithPassword({
      ticket,
      password,
      prisma,
      secretKey,
    });

    if (!result.success) {
      if (result.reason === "INVALID_TICKET" || result.reason === "EXPIRED_TICKET") {
        return NextResponse.json(
          {
            type: "/errors/invalid-ticket",
            title: "Invalid or Expired Ticket",
            status: 400,
            detail: "The account linking challenge has expired or is invalid. Please sign in again.",
            code: "INVALID_TICKET",
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      if (result.reason === "INVALID_PASSWORD") {
        return NextResponse.json(
          {
            type: "/errors/invalid-credentials",
            title: "Invalid Password",
            status: 401,
            detail: "Incorrect password. Please verify your password to link your account.",
            code: "INVALID_CREDENTIALS",
          },
          { status: 401, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      return NextResponse.json(
        {
          type: "/errors/account-not-found",
          title: "Account Not Found",
          status: 404,
          detail: "No matching credential account was found for this user.",
          code: "ACCOUNT_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Resolve user details, memberships, and roles
    const dbUser = await prisma.user.findUnique({
      where: { id: result.userId },
      include: {
        organizations: {
          where: { status: "ACTIVE" },
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        },
        branchRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
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
          type: "/errors/user-not-found",
          title: "User Not Found",
          status: 404,
          detail: "Authenticated user could not be loaded.",
          code: "USER_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
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

    // Extract permissions
    const userPermissions = extractEffectivePermissions(dbUser.branchRoles);

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    // Record security audit trail entry (SPEC-04 / OWASP ASVS 4.0.3 Non-Repudiation)
    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: dbUser.id,
      action: AUDIT_EVENT_TYPES.AUTH_ACCOUNT_LINKED,
      ipAddress: clientIp,
      userAgent,
      details: {
        providerId: result.providerId,
        accountId: result.accountId,
        linkedAt: new Date().toISOString(),
      },
    });

    // Resolve post-login route
    const redirectUrl = resolvePostLoginRoute({
      permissions: userPermissions,
      onboardingStatus,
      currentOnboardingStep,
    });

    // Generate signed session token
    const rawPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      organizationId: organization?.id,
      organizationName: organization?.name,
      role: roleName,
      permissions: userPermissions,
      userName: dbUser.name,
      themePreference,
      timestamp: Date.now(),
      onboardingStatus,
      currentOnboardingStep,
    });

    const sessionToken = await signSessionToken(rawPayload);

    const response = NextResponse.json({
      success: true,
      message: "OAuth account successfully linked.",
      redirectUrl,
    });

    const cookieOptions = createSessionCookieOptions(isProduction, false);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });
    return response;
  } catch (error) {
    console.error("Error executing account linking:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while linking account.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
