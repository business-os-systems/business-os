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
import { requireAuth, requireMetricsAuth } from "../src/middleware/auth.js";
import { createTestSessionToken } from "./helpers/auth.js";

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
    it("handles preflight OPTIONS request with 204 No Content for allowed origin", async () => {
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

    it("rejects unauthorized origin on OPTIONS preflight with 403", async () => {
      const app = new OpenAPIHono();
      app.use("*", corsMiddleware({ allowedOrigins: ["https://trusted.business-os.com"] }));
      app.get("/test", (c) => c.text("ok"));

      const res = await app.request("/test", {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil-attacker.com",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("CORS_ORIGIN_DENIED");
      expect(body.type).toBe("/errors/cors-origin-denied");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("omits allow-origin and allow-credentials headers for unauthorized origins on standard requests", async () => {
      const app = new OpenAPIHono();
      app.use("*", corsMiddleware({ allowedOrigins: ["https://trusted.business-os.com"] }));
      app.get("/test", (c) => c.text("ok"));

      const res = await app.request("/test", {
        method: "GET",
        headers: {
          Origin: "https://evil-attacker.com",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });
  });

  describe("Authentication Middleware (requireAuth)", () => {
    it("rejects requests without token with 401 AUTH_UNAUTHORIZED", async () => {
      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.use("*", requireAuth());
      app.get("/protected", (c) => c.text("protected"));

      const res = await app.request("/protected");
      expect(res.status).toBe(401);

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("AUTH_UNAUTHORIZED");
    });

    it("rejects tampered or forged token with 401 AUTH_TOKEN_INVALID", async () => {
      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.use("*", requireAuth());
      app.get("/protected", (c) => c.text("protected"));

      const res = await app.request("/protected", {
        headers: {
          Authorization: "Bearer invalid.token.signature",
        },
      });
      expect(res.status).toBe(401);

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("AUTH_TOKEN_INVALID");
    });

    it("rejects expired session token with 401 AUTH_SESSION_EXPIRED", async () => {
      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.use("*", requireAuth());
      app.get("/protected", (c) => c.text("protected"));

      const expiredToken = await createTestSessionToken({
        expiresAt: Date.now() - 60000,
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });
      expect(res.status).toBe(401);

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("AUTH_SESSION_EXPIRED");
    });

    it("allows authenticated request and injects user context with 200", async () => {
      interface AuthTestEnv {
        Variables: {
          userId: string;
          user: { userId: string };
        };
      }
      const app = new OpenAPIHono<AuthTestEnv>();
      app.onError(globalErrorHandler);
      app.use("*", requireAuth());
      app.get("/protected", (c) =>
        c.json({
          userId: c.get("userId"),
          user: c.get("user"),
        })
      );

      const validToken = await createTestSessionToken({
        userId: "usr_active_99",
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { userId: string; user: { userId: string } };
      expect(body.userId).toBe("usr_active_99");
      expect(body.user.userId).toBe("usr_active_99");
    });
  });

  describe("Telemetry Guard Middleware (requireMetricsAuth)", () => {
    it("rejects requests missing telemetry credentials with 401", async () => {
      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.get("/metrics", requireMetricsAuth(), (c) => c.text("metrics"));

      const res = await app.request("/metrics");
      expect(res.status).toBe(401);

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("METRICS_AUTH_REQUIRED");
    });

    it("accepts requests with matching METRICS_AUTH_TOKEN", async () => {
      process.env.METRICS_AUTH_TOKEN = "test-metrics-token-123";

      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.get("/metrics", requireMetricsAuth(), (c) => c.text("metrics_data"));

      const res = await app.request("/metrics", {
        headers: {
          Authorization: "Bearer test-metrics-token-123",
        },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("metrics_data");
    });

    it("accepts requests with matching x-metrics-key header", async () => {
      process.env.METRICS_AUTH_TOKEN = "test-metrics-token-123";

      const app = new OpenAPIHono();
      app.onError(globalErrorHandler);
      app.get("/metrics", requireMetricsAuth(), (c) => c.text("metrics_data"));

      const res = await app.request("/metrics", {
        headers: {
          "x-metrics-key": "test-metrics-token-123",
        },
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("metrics_data");
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
