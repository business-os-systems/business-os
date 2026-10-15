import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
} from "@/lib/auth-constants";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = Boolean(sessionToken && (await verifySessionToken(sessionToken)));

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isApiAuthRoute = pathname.startsWith("/api/auth");
  const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/i;
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    STATIC_ASSET_REGEX.test(pathname) ||
    pathname === "/favicon.ico";

  // Allow static files and authentication API endpoints to execute freely
  if (isPublicAsset || isApiAuthRoute) {
    return NextResponse.next();
  }

  // If user is not authenticated and is requesting a protected dashboard route, redirect to /login
  if (!isAuthenticated && !isAuthRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If user is already authenticated and visits /login, redirect directly to the App Launcher
  if (isAuthenticated && isAuthRoute) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  // Forward verified tenant context headers to downstream route handlers and server components
  const requestHeaders = new Headers(request.headers);
  if (sessionToken) {
    const payload = decodeSessionPayload(sessionToken);
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
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
