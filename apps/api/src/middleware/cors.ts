import type { MiddlewareHandler } from "hono";

export interface CorsOptions {
  allowedOrigins?: string[];
  allowCredentials?: boolean;
}

/**
 * Enterprise CORS middleware with explicit origin allowlist support.
 */
export function corsMiddleware(options: CorsOptions = {}): MiddlewareHandler {
  const { allowedOrigins = ["*"], allowCredentials = true } = options;

  return async (c, next) => {
    const origin = c.req.header("origin");

    let isAllowed = false;
    if (allowedOrigins.includes("*")) {
      isAllowed = true;
      c.header("Access-Control-Allow-Origin", origin ?? "*");
    } else if (origin && allowedOrigins.includes(origin)) {
      isAllowed = true;
      c.header("Access-Control-Allow-Origin", origin);
    }

    if (isAllowed && allowCredentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }

    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
    );
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-request-id, x-trace-id, x-correlation-id, x-organization-id, x-branch-id, x-idempotency-key, x-api-key"
    );
    c.header("Access-Control-Max-Age", "86400");

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}
