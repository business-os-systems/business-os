import type { MiddlewareHandler } from "hono";

/**
 * Enterprise security headers middleware (Helmet equivalent for Hono).
 * Hardens API against clickjacking, MIME sniffing, and cross-site scripting vulnerabilities.
 */
export function securityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    if (c.req.path.startsWith("/api/v1/admin")) {
      c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
      c.header("Pragma", "no-cache");
      c.header("Expires", "0");
    }

    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "0");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:;"
    );
  };
}
