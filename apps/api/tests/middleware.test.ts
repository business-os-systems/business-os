import { describe, it, expect, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { ProblemDetails } from "@suite/core";
import { requestIdMiddleware } from "../src/middleware/request-id.js";
import { securityHeadersMiddleware } from "../src/middleware/security-headers.js";
import { corsMiddleware } from "../src/middleware/cors.js";
import {
  rateLimitMiddleware,
  clearMemoryRateLimitStore,
} from "../src/middleware/rate-limit.js";
import { globalErrorHandler } from "../src/middleware/error-handler.js";

describe("Middleware Suite", () => {
  beforeEach(async () => {
    await clearMemoryRateLimitStore();
  });

  describe("Request ID Middleware", () => {
    it("generates a new unique request ID starting with req_ when none provided", async () => {
      const app = new OpenAPIHono();
      app.use("*", requestIdMiddleware());
      app.get("/test", (c) => c.json({ requestId: c.get("requestId") }));

      const res = await app.request("/test");
      expect(res.status).toBe(200);

      const headerId = res.headers.get("x-request-id");
      expect(headerId).toBeDefined();
      expect(headerId?.startsWith("req_")).toBe(true);

      const body = (await res.json()) as { requestId: string };
      expect(body.requestId).toBe(headerId);
    });

    it("propagates and preserves existing x-request-id header", async () => {
      const app = new OpenAPIHono();
      app.use("*", requestIdMiddleware());
      app.get("/test", (c) => c.json({ requestId: c.get("requestId") }));

      const incomingId = "custom-external-req-trace-999";
      const res = await app.request("/test", {
        headers: { "x-request-id": incomingId },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBe(incomingId);
      const body = (await res.json()) as { requestId: string };
      expect(body.requestId).toBe(incomingId);
    });
  });

  describe("Security Headers Middleware", () => {
    it("sets OWASP recommended HTTP security headers", async () => {
      const app = new OpenAPIHono();
      app.use("*", securityHeadersMiddleware());
      app.get("/test", (c) => c.text("ok"));

      const res = await app.request("/test");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-XSS-Protection")).toBe("0");
      expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    });
  });

  describe("CORS Middleware", () => {
    it("handles preflight OPTIONS request with 204 No Content", async () => {
      const app = new OpenAPIHono();
      app.use("*", corsMiddleware({ allowedOrigins: ["https://app.business-os.com"] }));
      app.get("/test", (c) => c.text("ok"));

      const res = await app.request("/test", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.business-os.com",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.business-os.com");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });
  });

  describe("Rate Limit Middleware", () => {
    it("attaches rate limit headers and enforces threshold", async () => {
      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.use(
        "*",
        rateLimitMiddleware({
          limit: 3,
          windowSeconds: 10,
          keyPrefix: "test:rl",
        })
      );
      app.get("/limited", (c) => c.text("ok"));

      // Request 1: OK
      const res1 = await app.request("/limited", {
        headers: { "x-forwarded-for": "192.168.1.100" },
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("RateLimit-Limit")).toBe("3");
      expect(res1.headers.get("RateLimit-Remaining")).toBe("2");

      // Request 2: OK
      const res2 = await app.request("/limited", {
        headers: { "x-forwarded-for": "192.168.1.100" },
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("RateLimit-Remaining")).toBe("1");

      // Request 3: OK
      const res3 = await app.request("/limited", {
        headers: { "x-forwarded-for": "192.168.1.100" },
      });
      expect(res3.status).toBe(200);
      expect(res3.headers.get("RateLimit-Remaining")).toBe("0");

      // Request 4: Rate limit exceeded -> 429
      const res4 = await app.request("/limited", {
        headers: { "x-forwarded-for": "192.168.1.100" },
      });
      expect(res4.status).toBe(429);
      const problem = (await res4.json()) as ProblemDetails;
      expect(problem.status).toBe(429);
      expect(problem.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });
});
