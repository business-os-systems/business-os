import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { checkRateLimit } from "@suite/redis";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, zodProblemResponse } from "@/lib/problem-response";
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
import { AUDIT_EVENT_TYPES, RATE_LIMITS } from "@suite/core";

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
    return problemResponse({
      status: 400,
      code: "INVALID_TICKET",
      title: "Bad Request",
      detail: "Ticket query parameter is required.",
    });
  }

  const payload = verifyAccountLinkingTicket(ticket, getBetterAuthSecret());
  if (!payload) {
    return problemResponse({
      status: 400,
      code: "INVALID_TICKET",
      title: "Invalid or Expired Ticket",
      detail: "The account linking ticket is invalid or has expired.",
    });
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
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message || "Invalid linking parameters",
      });
    }

    const { ticket, password } = parseResult.data;

    // Dual-tier brute-force rate limiting via @suite/redis (Tier 1: IP, Tier 2: Ticket)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimit = await checkRateLimit([
      ...(clientIp !== "unknown"
        ? [{ key: `ratelimit:link-account:ip:${clientIp}`, max: RATE_LIMITS.MAX_LINK_ATTEMPTS_PER_WINDOW_IP, windowSeconds: RATE_LIMITS.WINDOW_15_MIN_SECONDS }]
        : []),
      { key: `ratelimit:link-account:ticket:${ticket.slice(-32)}`, max: RATE_LIMITS.MAX_LINK_ATTEMPTS_PER_WINDOW_TICKET, windowSeconds: RATE_LIMITS.WINDOW_15_MIN_SECONDS },
    ]);

    if (!rateLimit.allowed) {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: rateLimit.detail || "Too many account linking attempts. Please try again later.",
        retryAfter: rateLimit.retryAfter,
      });
    }

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
        return problemResponse({
          status: 400,
          code: "INVALID_TICKET",
          title: "Invalid or Expired Ticket",
          detail: "The account linking challenge has expired or is invalid. Please sign in again.",
        });
      }

      if (result.reason === "INVALID_PASSWORD") {
        return problemResponse({
          status: 401,
          code: "INVALID_CREDENTIALS",
          title: "Invalid Password",
          detail: "Incorrect password. Please verify your password to link your account.",
        });
      }

      return problemResponse({
        status: 404,
        code: "ACCOUNT_NOT_FOUND",
        title: "Account Not Found",
        detail: "No matching credential account was found for this user.",
      });
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

    const userAgent = request.headers.get("user-agent");

    // Record security audit trail entry (SPEC-04 / OWASP ASVS 4.0.3 Non-Repudiation)
    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: dbUser.id,
      action: AUDIT_EVENT_TYPES.AUTH_ACCOUNT_LINKED,
      ipAddress: clientIp !== "unknown" ? clientIp : undefined,
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
