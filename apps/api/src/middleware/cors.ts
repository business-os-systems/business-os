import type { MiddlewareHandler, Context } from "hono";
import { AUTH_ERROR_CODES } from "@suite/auth";

export interface CorsOptions {
  allowedOrigins?: string[];
  allowCredentials?: boolean;
}

export const CORS_ALLOWED_ORIGINS_CONTEXT_KEY = "corsAllowedOrigins";
export const CORS_ALLOW_CREDENTIALS_CONTEXT_KEY = "corsAllowCredentials";

/**
 * Parses allowed origins from explicit options or the pre-declared environment variable.
 */
export function resolveAllowedOrigins(optionsOrigins?: string[]): string[] {
  if (optionsOrigins && optionsOrigins.length > 0) {
    return optionsOrigins;
  }
  const rawEnv = process.env.CORS_ALLOWED_ORIGINS;
  if (!rawEnv) {
    return [];
  }
  return rawEnv.split(",").map((o) => o.trim()).filter(Boolean);
}

export function resolvePlatformCorsOrigins(
  optionsOrigins?: string[]
): string[] {
  const origins = resolveAllowedOrigins(optionsOrigins);
  const platformOrigin = process.env.CONTROL_PLANE_ORIGIN?.trim();
  return platformOrigin ? [...new Set([...origins, platformOrigin])] : origins;
}

/**
 * Checks whether an incoming Origin header matches the configured CORS policy,
 * supporting exact domain matches and regex-anchored single-level wildcard subdomains.
 *
 * @param origin Incoming Origin header value from HTTP request
 * @param allowedOrigins Whitelist patterns (supports exact domains and single-level wildcards)
 * @returns True if origin is permitted; false otherwise
 */
export function isOriginPermitted(origin: string, allowedOrigins: string[]): boolean {
  if (!origin || !allowedOrigins || allowedOrigins.length === 0) return false;

  return allowedOrigins.some((pattern) => {
    if (pattern === origin) return true;
    if (pattern.includes("*")) {
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[a-zA-Z0-9-]+");
      const regex = new RegExp(`^${escaped}$`);
      return regex.test(origin);
    }
    return false;
  });
}

/**
 * Builds the response headers needed to make an error response readable across
 * origins. Hono's error handler builds a fresh Response, so the headers set by
 * the CORS middleware would otherwise be lost and the browser would surface a
 * generic "Failed to fetch" instead of the RFC 7807 problem details.
 */
export function buildCorsResponseHeaders(
  origin: string | undefined,
  allowedOrigins: string[],
  allowCredentials: boolean
): Record<string, string> {
  if (!origin) {
    return {};
  }
  const headers: Record<string, string> = { Vary: "Origin" };
  if (!allowCredentials && allowedOrigins.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  if (!isOriginPermitted(origin, allowedOrigins)) {
    return headers;
  }
  headers["Access-Control-Allow-Origin"] = origin;
  if (allowCredentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/**
 * Enterprise CORS Middleware
 *
 * Enforces:
 * 1. Strict whitelist validation against allowed origins (including multi-tenant wildcards).
 * 2. W3C/WHATWG compliance: Wildcards (*) are never paired with credentials.
 * 3. Cache isolation: Sets 'Vary: Origin' to prevent CDN cache poisoning.
 * 4. Fast preflight rejection: Rejects untrusted OPTIONS requests with 403 and Option A RFC 7807 problem details.
 */
export function corsMiddleware(options: CorsOptions = {}): MiddlewareHandler {
  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins);
  const allowCredentials = options.allowCredentials ?? true;

  return async (c: Context, next) => {
    const origin = c.req.header("origin");
    c.set(CORS_ALLOWED_ORIGINS_CONTEXT_KEY, allowedOrigins);
    c.set(CORS_ALLOW_CREDENTIALS_CONTEXT_KEY, allowCredentials);

    // Phase 1: Cross-origin security verification when Origin header is present
    if (origin) {
      const isPermitted = isOriginPermitted(origin, allowedOrigins);
      const isWildcardAllowed = !allowCredentials && allowedOrigins.includes("*");

      if (isPermitted) {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Vary", "Origin");
        if (allowCredentials) {
          c.header("Access-Control-Allow-Credentials", "true");
        }
      } else if (isWildcardAllowed) {
        c.header("Access-Control-Allow-Origin", "*");
      } else if (c.req.method === "OPTIONS") {
        // Fast preflight termination for unauthorized origins (RFC 7807 Option A)
        return c.json(
          {
            type: "/errors/cors-origin-denied",
            title: "Forbidden",
            status: 403,
            detail: "CORS origin not allowed",
            code: AUTH_ERROR_CODES.CORS_ORIGIN_DENIED,
          },
          403
        );
      }
    }

    // Phase 2: Set standard preflight headers for permitted methods and custom metadata headers
    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
    );
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-request-id, x-trace-id, x-correlation-id, x-organization-id, x-branch-id, x-idempotency-key, x-api-key"
    );
    c.header("Access-Control-Max-Age", "86400");

    // Phase 3: Immediate 204 No Content for preflight OPTIONS requests from authorized callers
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}
