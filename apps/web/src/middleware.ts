import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  HOST_ROLES,
  getHostModelConfig,
  isNonStorefrontPath,
  isSiteMetadataPath,
  readNormalizedRequestHost,
  resolveHost,
} from "@suite/core";
import {
  TENANT_SESSION_COOKIE_NAME,
  isTenantSessionHostBound,
  readTenantHostClaim,
} from "@suite/auth/session-cookie";
import {
  PREVIEW_TOKEN_HEADER,
  cacheStateForPageResult,
  storefrontCacheHeaders,
} from "@/lib/cache-control";
import { notFoundResponse } from "@/lib/storefront/pages";
import { loadStorefrontPage } from "@/lib/storefront/page-client";

export const TENANT_HOST_HEADER = "x-tenant-host";
export const TENANT_LABEL_HEADER = "x-tenant-label";

const INTERNAL_TENANT_HEADERS = [TENANT_HOST_HEADER, TENANT_LABEL_HEADER] as const;
const CORRELATION_HEADERS = ["x-correlation-id", "x-request-id", "traceparent"] as const;

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Vary", "Host");
  return response;
}

function neutralNotFound(): NextResponse {
  const response = notFoundResponse();
  return withSecurityHeaders(new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  }));
}

function readFirstHeader(request: NextRequest, names: readonly string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value !== null && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function stripInternalTenantHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers(requestHeaders);
  for (const headerName of INTERNAL_TENANT_HEADERS) {
    headers.delete(headerName);
  }
  return headers;
}

function buildTenantRequestHeaders(
  request: NextRequest,
  hostname: string,
  tenantLabel: string
): Headers {
  const headers = stripInternalTenantHeaders(request.headers);
  headers.set(TENANT_HOST_HEADER, hostname);
  headers.set(TENANT_LABEL_HEADER, tenantLabel);
  const correlationId = readFirstHeader(request, CORRELATION_HEADERS);
  if (correlationId !== null) {
    headers.set("x-correlation-id", correlationId);
  }
  return headers;
}

function isStorefrontRequest(request: NextRequest): boolean {
  // The sitemap and robots files belong to the storefront even though they are
  // reserved page paths: they must carry a public, host-keyed cache (FR-040).
  return (
    isSiteMetadataPath(request.nextUrl.pathname) ||
    !isNonStorefrontPath(request.nextUrl.pathname)
  );
}

/**
 * Storefront responses are cookieless: a cross-host session is cleaned up only
 * on workspace/auth paths, where the session actually applies. A public page
 * response never carries Set-Cookie (FR-036, FR-111).
 */
function clearCrossHostSession(response: NextResponse, request: NextRequest, hostname: string): void {
  const token = request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value;
  if (token === undefined) {
    return;
  }
  const claim = readTenantHostClaim(token);
  if (claim !== undefined && !isTenantSessionHostBound(claim, hostname)) {
    response.cookies.delete(TENANT_SESSION_COOKIE_NAME);
  }
}

function buildTenantResponse(
  request: NextRequest,
  hostname: string,
  tenantLabel: string
): NextResponse {
  const isStorefront = isStorefrontRequest(request);
  let responseHeaders = stripInternalTenantHeaders(request.headers);
  if (isStorefront) {
    responseHeaders = buildTenantRequestHeaders(request, hostname, tenantLabel);
  }

  const response = NextResponse.next({ request: { headers: responseHeaders } });
  if (!isStorefront) {
    // FR-115: workspace, auth and API paths are never indexed or publicly cached.
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    clearCrossHostSession(response, request, hostname);
  }
  return withSecurityHeaders(response);
}

function readPreviewToken(request: NextRequest): string | null {
  const header = request.headers.get(PREVIEW_TOKEN_HEADER);
  if (header !== null && header.trim().length > 0) {
    return header.trim();
  }
  const query = request.nextUrl.searchParams.get("preview");
  if (query !== null && query.trim().length > 0) {
    return query.trim();
  }
  return null;
}

async function applyStorefrontCache(
  response: NextResponse,
  request: NextRequest,
  hostname: string
): Promise<void> {
  const result = await loadStorefrontPage({
    host: hostname,
    path: request.nextUrl.pathname,
  });
  const headers = storefrontCacheHeaders({
    state: cacheStateForPageResult(result),
    host: hostname,
    path: request.nextUrl.pathname,
    previewToken: readPreviewToken(request),
  });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const hostname = readNormalizedRequestHost({
    headers: request.headers,
    fallbackHost: request.nextUrl.host,
  });
  if (hostname === null) {
    return neutralNotFound();
  }

  const resolution = resolveHost({ hostHeader: hostname, config: getHostModelConfig() });
  if (resolution.role !== HOST_ROLES.TENANT || resolution.tenantLabel === null) {
    return neutralNotFound();
  }

  const response = buildTenantResponse(request, hostname, resolution.tenantLabel);
  if (isStorefrontRequest(request)) {
    await applyStorefrontCache(response, request, hostname);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
