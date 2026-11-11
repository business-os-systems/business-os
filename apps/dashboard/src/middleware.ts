import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  createTenantSessionCookieOptions,
  verifySessionToken,
  decodeSessionPayload,
  encodeSessionPayload,
  signSessionToken,
  isSessionPayloadExpired,
  isSessionPayloadIdleTimedOut,
  type SessionPayload,
} from "@/lib/auth-constants";
import { isTenantSessionHostBound } from "@suite/auth/session-cookie";
import { readRequestHostname } from "@/lib/tenant-host";
import {
  isAuthenticationPath,
  isLegacyWorkspacePath,
  isLoginPath,
  workspacePath,
} from "@/lib/workspace-paths";

const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/i;
const ROLLING_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const ALLOWED_AUTHENTICATED_PATHS = [
  "/choose-tenant",
  "/reset-password",
  "/invite",
  "/verify-expired",
] as const;
const CORRELATION_HEADERS = ["x-correlation-id", "x-request-id", "traceparent"] as const;

function readFirstHeader(request: NextRequest, names: readonly string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value !== null && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isBypassRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1/auth") ||
    pathname === "/favicon.ico" ||
    STATIC_ASSET_REGEX.test(pathname)
  );
}

async function resolveSessionPayload(request: NextRequest): Promise<SessionPayload | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;

  const isValidSession = await verifySessionToken(sessionToken);
  if (!isValidSession) return null;

  const payload = decodeSessionPayload(sessionToken);
  if (!payload || isSessionPayloadExpired(payload) || isSessionPayloadIdleTimedOut(payload)) {
    return null;
  }

  return payload;
}

function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
}

function isSessionFromAnotherHost(
  payload: SessionPayload,
  requestHostname: string | null
): boolean {
  return !isTenantSessionHostBound(payload.tenantHost, requestHostname);
}

function handleUnauthenticatedGate(
  request: NextRequest,
  pathname: string,
  search: string
): NextResponse {
  if (isAuthenticationPath(pathname)) {
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
  const target = pathname + search;
  if (target !== "/") {
    loginUrl.searchParams.set("redirect", target);
  }
  return NextResponse.redirect(loginUrl);
}

function resolveLandingPath(payload: SessionPayload): string {
  if (payload.onboardingStatus !== "COMPLETED") {
    const step =
      payload.currentOnboardingStep && payload.currentOnboardingStep > 0
        ? payload.currentOnboardingStep
        : 1;
    return "/onboarding/step-" + String(step);
  }
  if (payload.organizationId) {
    return "/dashboard";
  }
  return "/choose-tenant";
}

async function handleAuthenticatedGate(
  request: NextRequest,
  payload: SessionPayload,
  pathname: string
): Promise<NextResponse> {
  if (ALLOWED_AUTHENTICATED_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return await createAuthenticatedResponse(request, payload);
  }

  if (isAuthenticationPath(pathname)) {
    if (isLoginPath(pathname) && request.nextUrl.searchParams.get("notice") === "archived") {
      const response = NextResponse.next();
      clearSessionCookie(response);
      return response;
    }
    return NextResponse.redirect(new URL(resolveLandingPath(payload), request.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(resolveLandingPath(payload), request.url));
  }

  return await enforceOnboardingGate(request, payload, pathname);
}

async function enforceOnboardingGate(
  request: NextRequest,
  payload: SessionPayload,
  pathname: string
): Promise<NextResponse> {
  const isApiPath = pathname.startsWith("/api/");
  const isOnboardingPath = pathname.startsWith("/onboarding");

  if (payload.onboardingStatus !== "COMPLETED") {
    if (!isOnboardingPath && !isApiPath) {
      return NextResponse.redirect(new URL(resolveLandingPath(payload), request.url));
    }
    return await createAuthenticatedResponse(request, payload);
  }

  if (isOnboardingPath || (!payload.organizationId && !isApiPath)) {
    return NextResponse.redirect(new URL(resolveLandingPath(payload), request.url));
  }

  return await createAuthenticatedResponse(request, payload);
}

async function createAuthenticatedResponse(
  request: NextRequest,
  payload: SessionPayload
): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers);
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
  const onboardingStatus =
    payload.onboardingStatus ?? (payload.organizationId ? "COMPLETED" : "IN_PROGRESS");
  requestHeaders.set("x-onboarding-status", onboardingStatus);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-onboarding-status", onboardingStatus);
  if (payload.organizationId) {
    response.headers.set("x-tenant-id", payload.organizationId);
  }

  await refreshRollingSession(response, payload);
  return response;
}

async function refreshRollingSession(
  response: NextResponse,
  payload: SessionPayload
): Promise<void> {
  const elapsedMs = Date.now() - payload.timestamp;
  if (elapsedMs <= ROLLING_REFRESH_INTERVAL_MS) {
    return;
  }
  const refreshedPayload: SessionPayload = { ...payload, timestamp: Date.now() };
  const refreshedToken = await signSessionToken(encodeSessionPayload(refreshedPayload));
  const maxAgeSeconds = payload.isEphemeral
    ? SESSION_EPHEMERAL_MAX_AGE_SECONDS
    : SESSION_PERSISTENT_MAX_AGE_SECONDS;
  const cookieOptions = createTenantSessionCookieOptions(maxAgeSeconds);
  response.cookies.set({ ...cookieOptions, value: refreshedToken });
}

function applySecurityHeaders(response: NextResponse, correlationId: string): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("x-correlation-id", correlationId);
  response.headers.set("x-request-id", correlationId);
  return response;
}

function resolveCorrelationId(request: NextRequest): string {
  return readFirstHeader(request, CORRELATION_HEADERS) ?? "trace_" + crypto.randomUUID();
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const correlationId = resolveCorrelationId(request);
  const { pathname, search } = request.nextUrl;

  if (isLegacyWorkspacePath(pathname)) {
    const canonicalUrl = new URL(workspacePath(pathname) + search, request.url);
    return applySecurityHeaders(NextResponse.redirect(canonicalUrl, 308), correlationId);
  }

  if (isBypassRoute(pathname)) {
    return applySecurityHeaders(NextResponse.next(), correlationId);
  }

  const requestHostname = readRequestHostname(request);
  const payload = await resolveSessionPayload(request);
  const isCrossHostSession =
    payload !== null && isSessionFromAnotherHost(payload, requestHostname);

  if (payload === null || isCrossHostSession) {
    const response = handleUnauthenticatedGate(request, pathname, search);
    if (isCrossHostSession) {
      clearSessionCookie(response);
    }
    return applySecurityHeaders(response, correlationId);
  }

  const response = await handleAuthenticatedGate(request, payload, pathname);
  return applySecurityHeaders(response, correlationId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};