import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
} from "@/lib/auth-constants";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValidSession = Boolean(sessionToken && (await verifySessionToken(sessionToken)));
  const payload = isValidSession && sessionToken ? decodeSessionPayload(sessionToken) : null;
  const isAuthenticated = Boolean(payload);

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isSuperAdminRoute = pathname.startsWith("/super-admin");
  const isSuperAdminLogin = pathname === "/super-admin/login";
  const isApiAuthRoute = pathname.startsWith("/api/auth");
  const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/i;
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    STATIC_ASSET_REGEX.test(pathname) ||
    pathname === "/favicon.ico";

  // Allow static files and public authentication API endpoints to execute freely
  if (isPublicAsset || isApiAuthRoute) {
    return NextResponse.next();
  }

  // 1. Super Admin Portal Route Isolation (/super-admin/*)
  if (isSuperAdminRoute) {
    if (!isAuthenticated) {
      if (isSuperAdminLogin) {
        return NextResponse.next();
      }
      const superAdminLoginUrl = new URL("/super-admin/login", request.url);
      superAdminLoginUrl.searchParams.set("redirect", `${pathname}${search}`);
      return NextResponse.redirect(superAdminLoginUrl);
    }

    const isSuperAdmin = Boolean(
      payload?.isSuperAdmin ||
        payload?.role === "platform-super-admin" ||
        payload?.role?.toLowerCase() === "super-admin"
    );

    if (!isSuperAdmin) {
      return new NextResponse(
        JSON.stringify({
          type: "/errors/forbidden",
          title: "Forbidden",
          status: 403,
          code: "SUPER_ADMIN_REQUIRED",
          detail: "Platform Super Admin role required.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/problem+json" },
        }
      );
    }

    if (isSuperAdminLogin) {
      const superAdminDashboardUrl = new URL("/super-admin", request.url);
      return NextResponse.redirect(superAdminDashboardUrl);
    }

    // Authenticated super admin accessing super admin portal
    return createAuthenticatedResponse(request, payload);
  }

  // 2. Unauthenticated User Gate
  if (!isAuthenticated) {
    if (isAuthRoute) {
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

  // 3. Authenticated User - Determine Onboarding State
  const isOnboardingComplete = payload?.onboardingStatus === "COMPLETED";
  const isOnboardingIncomplete = !isOnboardingComplete;
  const currentStep =
    payload?.currentOnboardingStep && payload.currentOnboardingStep > 0
      ? payload.currentOnboardingStep
      : 1;
  const onboardingStepPath = `/onboarding/step-${currentStep}`;

  // Rule 1: Authenticated User Exclusion (Guest Guard)
  if (isAuthRoute) {
    const destinationUrl = new URL(
      isOnboardingIncomplete ? onboardingStepPath : "/dashboard",
      request.url
    );
    return NextResponse.redirect(destinationUrl);
  }

  // Rule 4: Onboarding Guard (Dashboard & App Protection)
  if (isOnboardingIncomplete) {
    // Incomplete users can only access /onboarding/* and /api/*
    if (!pathname.startsWith("/onboarding") && !pathname.startsWith("/api/")) {
      const onboardingUrl = new URL(onboardingStepPath, request.url);
      return NextResponse.redirect(onboardingUrl);
    }
  } else {
    // Complete users attempting to re-access onboarding flow are redirected to dashboard
    if (pathname.startsWith("/onboarding")) {
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // 4. Forward verified tenant and identity headers
  return createAuthenticatedResponse(request, payload);
}

function createAuthenticatedResponse(
  request: NextRequest,
  payload: ReturnType<typeof decodeSessionPayload>
) {
  const requestHeaders = new Headers(request.headers);
  if (payload) {
    if (payload.organizationId) {
      requestHeaders.set("x-tenant-id", payload.organizationId);
      requestHeaders.set("x-organization-id", payload.organizationId);
    }
    requestHeaders.set("x-user-id", payload.userId);
    requestHeaders.set("x-user-role", payload.role);
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
    requestHeaders.set("x-is-super-admin", payload.isSuperAdmin ? "true" : "false");
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (payload) {
    response.headers.set("x-is-super-admin", payload.isSuperAdmin ? "true" : "false");
    response.headers.set(
      "x-onboarding-status",
      payload.onboardingStatus || (payload.organizationId ? "COMPLETED" : "IN_PROGRESS")
    );
    if (payload.organizationId) {
      response.headers.set("x-tenant-id", payload.organizationId);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
