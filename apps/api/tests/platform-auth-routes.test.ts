import { describe, expect, it, beforeAll } from "vitest";
import { Hono } from "hono";
import { UnauthorizedError } from "@suite/core/errors";
import { platformAuthRouter } from "../src/routes/admin/auth.js";
import { corsMiddleware } from "../src/middleware/cors.js";
import { globalErrorHandler } from "../src/middleware/error-handler.js";

beforeAll(() => {
  process.env.CONTROL_PLANE_ORIGIN = "http://localhost:3002";
});

platformAuthRouter.onError(globalErrorHandler);

describe("Platform auth route guards", () => {
  it("rejects /me without a control session", async () => {
    const response = await platformAuthRouter.request("/me", {
      headers: { Origin: "http://localhost:3002" },
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("rejects /me from a tenant origin", async () => {
    const response = await platformAuthRouter.request("/me", {
      headers: { Origin: "http://localhost:3001" },
    });
    expect(response.status).toBe(403);
  });

  it("rejects a POST from an untrusted origin", async () => {
    const response = await platformAuthRouter.request("/sign-in/options", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("CORS_ORIGIN_DENIED");
  });

  it("allows only the configured Platform origin with credentials", async () => {
    const app = new Hono();
    app.use(
      "*",
      corsMiddleware({ allowedOrigins: ["http://localhost:3002"] })
    );
    app.get("/probe", (c) => c.text("ok"));

    const response = await app.request("/probe", {
      headers: { Origin: "http://localhost:3002" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3002"
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("keeps CORS headers on RFC 7807 error responses", async () => {
    const app = new Hono();
    app.use(
      "*",
      corsMiddleware({ allowedOrigins: ["http://localhost:3002"] })
    );
    app.onError(globalErrorHandler);
    app.get("/boom", () => {
      throw new UnauthorizedError("Sign-in failed.", {
        code: "AUTH_UNAUTHORIZED",
      });
    });

    const response = await app.request("/boom", {
      headers: { Origin: "http://localhost:3002" },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3002"
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response.headers.get("Content-Type")).toContain(
      "application/problem+json"
    );
  });

  it("denies every auth POST from an untrusted origin", async () => {
    const paths = [
      "/logout",
      "/bootstrap/options",
      "/bootstrap/verify",
      "/sign-in/verify",
    ];
    for (const path of paths) {
      const response = await platformAuthRouter.request(path, {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "x-forwarded-for": "198.51.100.90",
        },
      });
      expect(response.status).toBe(403);
    }
  });

  it("rate-limits sign-in options per IP", async () => {
    const ip = `203.0.113.${Date.now() % 200}`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await platformAuthRouter.request("/sign-in/options", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "x-forwarded-for": ip,
        },
      });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });
});
