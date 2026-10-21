import type { NextRequest } from "next/server";

export interface RequestOriginOptions {
  /** Optional fallback URL if headers and env are missing */
  fallbackUrl?: string;
}

/**
 * Resolves the canonical public origin for an incoming HTTP request.
 * Pure capability & header-driven resolution:
 * 1. Reverse-proxy headers (`x-forwarded-host` + `x-forwarded-proto` or `host`)
 * 2. Pre-declared canonical configuration (`NEXT_PUBLIC_APP_URL`)
 * 3. Incoming request URL fallback (`request.url`)
 */
export function resolveRequestOrigin(
  request: Request | NextRequest,
  options?: RequestOriginOptions
): string {
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ||
    request.headers.get("host")?.trim();

  if (forwardedHost && !forwardedHost.startsWith("0.0.0.0")) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.trim() ||
      (request.url.startsWith("https") ? "https" : "http");
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, "");
  }

  if (options?.fallbackUrl) {
    return options.fallbackUrl.trim().replace(/\/+$/, "");
  }

  try {
    return new URL(request.url).origin.replace(/\/+$/, "");
  } catch {
    return "http://localhost:3001";
  }
}
