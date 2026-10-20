import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  isSessionPayloadExpired,
  isSessionPayloadIdleTimedOut,
  type SessionPayload,
} from "@/lib/auth-constants";
import { isProduction } from "@/lib/env";

const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/i;

function isBypassRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1/auth") ||
    pathname === "/favicon.ico" ||
    STATIC_ASSET_REGEX.test(pathname)
  );
}

function isAuthenticationRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/link-account")
  );
}

function isInvitationRoute(pathname: string): boolean {
  return pathname.startsWith("/invite");
}

function isVerificationRecoveryRoute(pathname: string): boolean {
  return pathname.startsWith("/verify-expired");
}

async function resolveSessionPayload(request: NextRequest): Promise<SessionPayload | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;

  const isValidSession = await verifySessionToken(sessionToken);
  if (!isValidSession) return null;

  const payload = decodeSessionPayload(sessionToken);
  if (
    !payload ||
    isSessionPayloadExpired(payload) ||
    isSessionPayloadIdleTimedOut(payload)
  ) {
    return null;
  }

  return payload;
}


function handleUnauthenticatedGate(
  request: NextRequest,
  pathname: string,
  search: string
): NextResponse {
  if (
    isAuthenticationRoute(pathname) ||
    isInvitationRoute(pathname) ||
    isVerificationRecoveryRoute(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Authentication required to access API resource.",
      },
      { status: 401, headers: { "Content-Type": "application/problem+json" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  const target = `${pathname}${search}`;
  if (target && target !== "/") {
    loginUrl.searchParams.set("redirect", target);
  }
  return NextResponse.redirect(loginUrl);
}

async function handleAuthenticatedGate(
  request: NextRequest,
  payload: SessionPayload,
  pathname: string
): Promise<NextResponse> {
  if (isInvitationRoute(pathname) || isVerificationRecoveryRoute(pathname)) {
    return createAuthenticatedResponse(request, payload);
  }

  // Multi-tenancy disambiguation: Allow workspace selection route for authenticated users
  if (pathname.startsWith("/choose-tenant")) {
    return createAuthenticatedResponse(request, payload);
  }

  // Allow password reset flow even for authenticated sessions (Task T015)
  if (pathname.startsWith("/reset-password")) {
    return createAuthenticatedResponse(request, payload);
  }

  const isAuthRoute = isAuthenticationRoute(pathname);
  const isOnboardingComplete = payload.onboardingStatus === "COMPLETED";
  const isOnboardingIncomplete = !isOnboardingComplete;
  const currentStep =
    payload.currentOnboardingStep && payload.currentOnboardingStep > 0
      ? payload.currentOnboardingStep
      : 1;
  const onboardingStepPath = `/onboarding/step-${currentStep}`;

  if (isAuthRoute) {
    if (
      pathname.startsWith("/login") &&
      request.nextUrl.searchParams.get("notice") === "archived"
    ) {
      const response = NextResponse.next();
      const cookieOptions = createSessionCookieOptions(isProduction, true);
      response.cookies.delete(cookieOptions.name);
      return response;
    }

    const destinationUrl = new URL(
      isOnboardingIncomplete
        ? onboardingStepPath
        : payload.organizationId
        ? "/dashboard"
        : "/choose-tenant",
      request.url
    );
    return NextResponse.redirect(destinationUrl);
  }

  if (pathname === "/") {
    const destinationUrl = new URL(
      isOnboardingIncomplete
        ? onboardingStepPath
        : payload.organizationId
        ? "/dashboard"
        : "/choose-tenant",
      request.url
    );
    return NextResponse.redirect(destinationUrl);
  }

  if (isOnboardingIncomplete) {
    if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/api/")) {
      const onboardingUrl = new URL(onboardingStepPath, request.url);
      return NextResponse.redirect(onboardingUrl);
    }
  } else if (pathname.startsWith("/onboarding")) {
    const destinationUrl = new URL(
      payload.organizationId ? "/dashboard" : "/choose-tenant",
      request.url
    );
    return NextResponse.redirect(destinationUrl);
  } else if (!payload.organizationId && !pathname.startsWith("/api/")) {
    // Multi-tenant disambiguation (SPEC-05): redirect completed onboarding users with no active workspace to /choose-tenant
    const chooseTenantUrl = new URL("/choose-tenant", request.url);
    return NextResponse.redirect(chooseTenantUrl);
  }

  return createAuthenticatedResponse(request, payload);
}

async function createAuthenticatedResponse(
  request: NextRequest,
  payload: SessionPayload
): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers);

  // Strip client-supplied internal headers to prevent header injection
  const internalContextHeaders = [
    "x-tenant-id",
    "x-organization-id",
    "x-user-id",
    "x-user-role",
    "x-user-permissions",
    "x-user-name",
    "x-branch-id",
    "x-branch-name",
    "x-onboarding-status",
  ];
  for (const headerName of internalContextHeaders) {
    requestHeaders.delete(headerName);
  }

  if (payload.organizationId) {
    requestHeaders.set("x-tenant-id", payload.organizationId);
    requestHeaders.set("x-organization-id", payload.organizationId);
  }
  requestHeaders.set("x-user-id", payload.userId);
  if (payload.role) {
    requestHeaders.set("x-user-role", payload.role);
  }
  if (payload.permissions && payload.permissions.length > 0) {
    requestHeaders.set("x-user-permissions", payload.permissions.join(","));
  }
  requestHeaders.set("x-user-name", encodeURIComponent(payload.userName));
  if (payload.activeBranchId) {
    requestHeaders.set("x-branch-id", payload.activeBranchId);
  }
  if (payload.activeBranchName) {
    requestHeaders.set("x-branch-name", encodeURIComponent(payload.activeBranchName));
  }
  requestHeaders.set(
    "x-onboarding-status",
    payload.onboardingStatus || (payload.organizationId ? "COMPLETED" : "IN_PROGRESS")
  );
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(
    "x-onboarding-status",
    payload.onboardingStatus || (payload.organizationId ? "COMPLETED" : "IN_PROGRESS")
  );
  if (payload.organizationId) {
    response.headers.set("x-tenant-id", payload.organizationId);
  }

  // SPEC-03: Rolling session sliding window: refresh session cookie maxAge on active requests if > 1 hour elapsed
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const elapsedMs = Date.now() - (payload.timestamp || 0);
  if (elapsedMs > ONE_HOUR_MS) {
    const isKeepSignedIn = !payload.isEphemeral;
    const refreshedPayload: SessionPayload = {
      ...payload,
      timestamp: Date.now(),
    };
    const refreshedToken = await signSessionToken(encodeSessionPayload(refreshedPayload));
    const cookieOptions = createSessionCookieOptions(isProduction, isKeepSignedIn);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: refreshedToken,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      maxAge: cookieOptions.maxAge,
      path: cookieOptions.path,
    });
  }

  return response;
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  let response: NextResponse;
  if (isBypassRoute(pathname)) {
    response = NextResponse.next();
  } else {
    const payload = await resolveSessionPayload(request);

    if (!payload) {
      response = handleUnauthenticatedGate(request, pathname, search);
    } else {
      response = await handleAuthenticatedGate(request, payload, pathname);
    }
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
