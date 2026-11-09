import type { MiddlewareHandler, Context } from "hono";
import { UnauthorizedError } from "@suite/core/errors";
import {
  extractTokenFromHeader,
  extractTokenFromCookie,
  verifySessionToken,
  decodeSessionPayload,
  isSessionPayloadExpired,
} from "@suite/auth";
import { getMetricsAuthToken } from "../lib/env.js";

export interface RequireAuthOptions {
  allowApiKey?: boolean;
}

function extractSessionToken(c: Context): string | null {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  return extractTokenFromHeader(authHeader) ?? extractTokenFromCookie(cookieHeader);
}

/**
 * Standalone API Authentication Guard Middleware.
 * Validates cryptographically signed HMAC session tokens from headers or cookies.
 * Attaches verified session claims to Hono context and rejects unauthenticated calls with HTTP 401.
 */
export function requireAuth(_options: RequireAuthOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    const token = extractSessionToken(c);

    if (!token) {
      throw new UnauthorizedError("Authentication required. Missing session token.", {
        code: "AUTH_UNAUTHORIZED",
      });
    }

    const isValid = await verifySessionToken(token);
    if (!isValid) {
      throw new UnauthorizedError("Invalid or forged session token.", {
        code: "AUTH_TOKEN_INVALID",
      });
    }

    const payload = decodeSessionPayload(token);
    if (!payload?.userId) {
      throw new UnauthorizedError("Malformed session payload.", {
        code: "AUTH_PAYLOAD_INVALID",
      });
    }

    if (isSessionPayloadExpired(payload)) {
      throw new UnauthorizedError("Session has expired. Please re-authenticate.", {
        code: "AUTH_SESSION_EXPIRED",
      });
    }

    c.set("user", payload as unknown as Record<string, unknown>);
    c.set("userId", payload.userId);
    if (payload.organizationId) {
      c.set("organizationId", payload.organizationId);
    }
    if (payload.activeBranchId) {
      c.set("branchId", payload.activeBranchId);
    }

    await next();
  };
}

function providerTokenMatches(providedToken: string, configuredToken: string): boolean {
  return configuredToken.length > 0 && providedToken === configuredToken;
}

/**
 * Telemetry Metrics Authentication Guard Middleware.
 * Protects Prometheus /metrics from anonymous public internet exposure.
 */
export function requireMetricsAuth(): MiddlewareHandler {
  return async (c, next) => {
    const configuredToken = getMetricsAuthToken();
    const authHeader = c.req.header("Authorization");
    const metricsKeyHeader = c.req.header("x-metrics-key");

    const bearerToken = extractTokenFromHeader(authHeader);
    const providedToken = bearerToken ?? metricsKeyHeader;

    if (!providedToken) {
      throw new UnauthorizedError("Authentication required to access telemetry metrics.", {
        code: "METRICS_AUTH_REQUIRED",
      });
    }

    if (providerTokenMatches(providedToken, configuredToken)) {
      return await next();
    }

    const isValid = await verifySessionToken(providedToken);
    if (isValid) {
      const payload = decodeSessionPayload(providedToken);
      if (payload && !isSessionPayloadExpired(payload)) {
        return await next();
      }
    }

    throw new UnauthorizedError("Invalid telemetry authentication credentials.", {
      code: "METRICS_AUTH_INVALID",
    });
  };
}
