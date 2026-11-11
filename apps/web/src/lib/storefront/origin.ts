/**
 * Public origin resolution for tenant-host metadata routes (FR-040, FR-042,
 * FR-117). The hostname always comes from the declared host model, never from
 * a literal, and the scheme from the proxy's forwarded protocol.
 */

import {
  HOST_ROLES,
  getHostModelConfig,
  normalizeHostname,
  readNormalizedRequestHost,
  resolveHost,
} from "@suite/core";

export interface TenantOrigin {
  readonly hostname: string;
  readonly origin: string;
}

const HTTPS_PROTOCOL = "https:";
const HTTP_PROTOCOL = "http:";
const TRUSTED_HOST_HEADER = "x-tenant-host";

function readRequestProtocol(request: Request): string {
  try {
    return new URL(request.url).protocol === HTTP_PROTOCOL ? HTTP_PROTOCOL : HTTPS_PROTOCOL;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return HTTPS_PROTOCOL;
    }
    throw error;
  }
}

function readProtocol(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-proto");
  const value = forwarded?.split(",")[0]?.trim().toLowerCase();
  if (value === "http") {
    return HTTP_PROTOCOL;
  }
  if (value === "https") {
    return HTTPS_PROTOCOL;
  }
  return readRequestProtocol(request);
}

function readUrlHost(request: Request): string | null {
  try {
    return new URL(request.url).host;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}

function originFor(hostname: string, request: Request): TenantOrigin {
  return { hostname, origin: readProtocol(request) + "//" + hostname };
}

/**
 * Page delivery reads the host the middleware verified and forwarded. The
 * forwarded header is stripped from every non-storefront request, so a client
 * cannot inject it on a page path.
 */
export function resolveStorefrontOrigin(request: Request): TenantOrigin | null {
  const hostname = normalizeHostname(request.headers.get(TRUSTED_HOST_HEADER));
  if (hostname === null) {
    return null;
  }
  return originFor(hostname, request);
}

/**
 * Sitemap and robots are served outside the page renderer, so they read the
 * request authority and re-validate it against the declared host model before
 * emitting any absolute URL.
 */
export function resolveMetadataOrigin(request: Request): TenantOrigin | null {
  const hostname = readNormalizedRequestHost({
    headers: request.headers,
    fallbackHost: readUrlHost(request),
  });
  if (hostname === null) {
    return null;
  }
  const resolution = resolveHost({
    hostHeader: hostname,
    config: getHostModelConfig(),
  });
  if (resolution.role !== HOST_ROLES.TENANT) {
    return null;
  }
  return originFor(hostname, request);
}
