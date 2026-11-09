import { NextRequest, NextResponse } from "next/server";
import {
  exchangeOAuthCode,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { resolveRequestOrigin } from "@/lib/origin";
import {
  recordOAuthLoginAudit,
  resolveOAuthLogin,
  type OAuthLoginContext,
} from "@/services/oauth-callback.service";

const OAUTH_STATE_COOKIE = "oauth_state";
const LOGIN_FAILED_PATH = "/login?error=oauth_failed";

function createCleanRedirect(origin: string, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, origin), 302);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: isProduction,
  });
  return response;
}

async function buildCallbackResponse(input: {
  readonly context: OAuthLoginContext;
  readonly provider: string;
  readonly origin: string;
  readonly request: NextRequest;
}): Promise<NextResponse> {
  const { context, provider, origin, request } = input;
  const redirectPath = context.hasMultipleWorkspaces
    ? "/choose-tenant"
    : resolvePostLoginRoute({
        permissions: context.permissions,
        onboardingStatus: context.onboardingStatus,
        currentOnboardingStep: context.currentOnboardingStep,
      });

  const token = await signSessionToken(
    encodeSessionPayload({
      userId: context.userId,
      email: context.email,
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      role: context.roleName,
      permissions: context.permissions,
      userName: context.userName,
      activeBranchId: context.activeBranchId,
      activeBranchName: context.activeBranchName,
      themePreference: context.themePreference,
      timestamp: Date.now(),
      onboardingStatus: context.onboardingStatus,
      currentOnboardingStep: context.currentOnboardingStep,
    })
  );

  const cookieOptions = createSessionCookieOptions(isProduction, true);
  const response = createCleanRedirect(origin, redirectPath);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });

  await recordOAuthLoginAudit({
    userId: context.userId,
    organizationId: context.organizationId,
    provider,
    clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent"),
  });
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> | { provider: string } },
): Promise<NextResponse> {
  const resolvedParams = await context.params;
  const provider = resolvedParams.provider.toLowerCase().trim();
  const origin = resolveRequestOrigin(request);
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const code = searchParams.get("code");

  if (searchParams.get("error")) {
    return createCleanRedirect(origin, "/login?error=oauth_cancelled");
  }

  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    console.error(`[OAuth Error: State Mismatch] provider=${provider}`);
    return createCleanRedirect(origin, LOGIN_FAILED_PATH);
  }

  if (!code) {
    console.error(`[OAuth Error: Missing Code] provider=${provider}`);
    return createCleanRedirect(origin, LOGIN_FAILED_PATH);
  }

  try {
    const exchange = await exchangeOAuthCode({
      provider,
      code,
      redirectUri: `${origin}/api/auth/callback/${provider}`,
    });
    const result = await resolveOAuthLogin(exchange);
    if (result.status === "account_collision") {
      return createCleanRedirect(
        origin,
        `/link-account?ticket=${encodeURIComponent(result.ticket)}`
      );
    }
    return await buildCallbackResponse({ context: result.context, provider, origin, request });
  } catch (error) {
    console.error(`[OAuth Callback Exception] provider=${provider}:`, error);
    return createCleanRedirect(origin, LOGIN_FAILED_PATH);
  }
}
