import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
  isSessionPayloadExpired,
  type SessionPayload,
} from "@/lib/auth-constants";

const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/i;

function isBypassRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    STATIC_ASSET_REGEX.test(pathname)
  );
}

function isAuthenticationRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  );
}

function isInvitationRoute(pathname: string): boolean {
  return pathname.startsWith("/invite");
}

async function resolveSessionPayload(request: NextRequest): Promise<SessionPayload | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;

  const isValidSession = await verifySessionToken(sessionToken);
  if (!isValidSession) return null;

  const payload = decodeSessionPayload(sessionToken);
  if (!payload || isSessionPayloadExpired(payload)) return null;

  return payload;
}


function handleUnauthenticatedGate(
  request: NextRequest,
  pathname: string,
  search: string
): NextResponse {
  if (isAuthenticationRoute(pathname) || isInvitationRoute(pathname)) {
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

function handleAuthenticatedGate(
  request: NextRequest,
  payload: SessionPayload,
  pathname: string
): NextResponse {
  if (isInvitationRoute(pathname)) {
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
    const destinationUrl = new URL(
      isOnboardingIncomplete ? onboardingStepPath : "/dashboard",
      request.url
    );
    return NextResponse.redirect(destinationUrl);
  }

  if (pathname === "/") {
    const destinationUrl = new URL(
      isOnboardingIncomplete ? onboardingStepPath : "/dashboard",
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
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return createAuthenticatedResponse(request, payload);
}

function createAuthenticatedResponse(
  request: NextRequest,
  payload: SessionPayload
): NextResponse {
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

  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (isBypassRoute(pathname)) {
    return NextResponse.next();
  }

  const payload = await resolveSessionPayload(request);

  if (!payload) {
    return handleUnauthenticatedGate(request, pathname, search);
  }

  return handleAuthenticatedGate(request, payload, pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
