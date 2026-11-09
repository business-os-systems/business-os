import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getBetterAuthSecret,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifyAccountLinkingTicket,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, zodProblemResponse } from "@/lib/problem-response";
import {
  linkAccountWithPassword,
  type AccountLinkContext,
  type LinkAccountResult,
} from "@/services/link-account.service";

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

function mapLinkProblem(result: LinkAccountResult): NextResponse {
  switch (result.status) {
    case "rate_limited":
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: result.detail || "Too many account linking attempts. Please try again later.",
        retryAfter: result.retryAfter,
      });
    case "invalid_ticket":
      return problemResponse({
        status: 400,
        code: "INVALID_TICKET",
        title: "Invalid or Expired Ticket",
        detail: "The account linking challenge has expired or is invalid. Please sign in again.",
      });
    case "invalid_password":
      return problemResponse({
        status: 401,
        code: "INVALID_CREDENTIALS",
        title: "Invalid Password",
        detail: "Incorrect password. Please verify your password to link your account.",
      });
    case "account_not_found":
      return problemResponse({
        status: 404,
        code: "ACCOUNT_NOT_FOUND",
        title: "Account Not Found",
        detail: "No matching credential account was found for this user.",
      });
    case "user_not_found":
      return problemResponse({
        status: 404,
        code: "USER_NOT_FOUND",
        title: "User Not Found",
        detail: "Authenticated user could not be loaded.",
      });
    case "linked":
      return problemResponse({
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        title: "Internal Server Error",
        detail: "Unexpected account linking outcome.",
      });
  }
}

async function buildLinkedResponse(context: AccountLinkContext): Promise<NextResponse> {
  const redirectUrl = resolvePostLoginRoute({
    permissions: context.permissions,
    onboardingStatus: context.onboardingStatus,
    currentOnboardingStep: context.currentOnboardingStep,
  });

  const sessionToken = await signSessionToken(
    encodeSessionPayload({
      userId: context.userId,
      email: context.email,
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      role: context.roleName,
      permissions: context.permissions,
      userName: context.userName,
      themePreference: context.themePreference,
      timestamp: Date.now(),
      onboardingStatus: context.onboardingStatus,
      currentOnboardingStep: context.currentOnboardingStep,
    })
  );

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
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = linkAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message || "Invalid linking parameters",
      });
    }

    const result = await linkAccountWithPassword({
      ticket: parseResult.data.ticket,
      password: parseResult.data.password,
      clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent"),
    });
    if (result.status !== "linked") {
      return mapLinkProblem(result);
    }
    return await buildLinkedResponse(result.context);
  } catch (error) {
    console.error("Error executing account linking:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while linking account.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
