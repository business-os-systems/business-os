import { describe, it, expect } from "vitest";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { ProblemDetails } from "@suite/core";
import {
  AppError,
  NotFoundError,
  ValidationError,
  RateLimitError,
} from "@suite/core/errors";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/middleware/request-id.js";

interface ExtendedProblemDetails extends ProblemDetails {
  stack?: unknown;
}

const PROBLEM_CONTENT_TYPE = "application/problem+json";
const NOT_FOUND_PATH = "/test-not-found";

describe("Global RFC 7807 Error Handler", () => {
  const setupErrorApp = () => {
    const testApp = new OpenAPIHono();
    testApp.use("*", requestIdMiddleware());
    testApp.onError(globalErrorHandler);

    testApp.get(NOT_FOUND_PATH, () => {
      throw new NotFoundError("Resource with id 123 not found", {
        code: "RESOURCE_NOT_FOUND",
      });
    });

    testApp.get("/test-validation", () => {
      throw new ValidationError("Invalid parameters provided", [
        { name: "email", reason: "Invalid email format", code: "INVALID_EMAIL" },
      ]);
    });

    testApp.get("/test-rate-limit", () => {
      throw new RateLimitError("Rate limit exceeded", 30);
    });

    testApp.get("/test-custom-app-error", () => {
      throw new AppError({
        status: 403,
        code: "TENANT_ACCESS_DENIED",
        title: "Forbidden Tenant Access",
        detail: "User is not authorized to access organization branch",
      });
    });

    testApp.get("/test-http-exception", () => {
      throw new HTTPException(418, { message: "The request cannot be processed." });
    });

    testApp.get("/test-http-server-exception", () => {
      throw new HTTPException(503, { message: "Upstream dependency is unavailable." });
    });

    testApp.get("/test-unhandled", () => {
      throw new Error("Sensitive database connection password leaked in stack trace!");
    });

    return testApp;
  };

  const app = setupErrorApp();

  it("handles NotFoundError with RFC 7807 problem details format and status 404", async () => {
    const res = await app.request(NOT_FOUND_PATH, {
      headers: { "x-request-id": "req_custom_id_123" },
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);

    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(404);
    expect(body.title).toBe("Resource Not Found");
    expect(body.code).toBe("RESOURCE_NOT_FOUND");
    expect(body.detail).toBe("Resource with id 123 not found");
    expect(body.instance).toBe(NOT_FOUND_PATH);
    expect(body.requestId).toBe("req_custom_id_123");
    expect(typeof body.timestamp).toBe("string");
  });

  it("handles ValidationError with invalidParams list and status 422", async () => {
    const res = await app.request("/test-validation");

    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);

    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(422);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.invalidParams).toBeDefined();
    expect(body.invalidParams).toHaveLength(1);
    expect(body.invalidParams?.[0]).toEqual({
      name: "email",
      reason: "Invalid email format",
      code: "INVALID_EMAIL",
    });
  });

  it("handles RateLimitError with status 429", async () => {
    const res = await app.request("/test-rate-limit");

    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);

    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(429);
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("handles domain AppError with custom 403 status and code", async () => {
    const res = await app.request("/test-custom-app-error");

    expect(res.status).toBe(403);
    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(403);
    expect(body.code).toBe("TENANT_ACCESS_DENIED");
    expect(body.title).toBe("Forbidden Tenant Access");
  });

  it("maps a Hono HTTPException through the shared problem envelope", async () => {
    const res = await app.request("/test-http-exception");

    expect(res.status).toBe(418);
    expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);
    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(418);
    expect(body.code).toBe("HTTP_EXCEPTION");
    expect(body.type).toBe("/errors/http-exception");
    expect(body.title).toBe("Bad Request");
    expect(body.instance).toBe("/test-http-exception");
  });

  it("maps a server-side HTTPException to the internal error presentation", async () => {
    const res = await app.request("/test-http-server-exception");

    expect(res.status).toBe(503);
    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.type).toBe("/errors/internal-server-error");
    expect(body.title).toBe("Internal Server Error");
    expect(body.detail).toBe("Upstream dependency is unavailable.");
  });

  it("attaches the CORS headers to an error response for an allowed origin", async () => {
    const previousOrigins = process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    try {
      const res = await app.request(NOT_FOUND_PATH, {
        headers: { origin: "https://app.example.com" },
      });
      expect(res.status).toBe(404);
      expect(res.headers.get("access-control-allow-origin")).toBe(
        "https://app.example.com"
      );
      expect(res.headers.get("vary")).toBe("Origin");
    } finally {
      if (previousOrigins === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
      } else {
        process.env.CORS_ALLOWED_ORIGINS = previousOrigins;
      }
    }
  });

  it("masks unhandled exceptions with safe generic 500 error and NO stack trace leakage", async () => {
    const res = await app.request("/test-unhandled");

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain(PROBLEM_CONTENT_TYPE);

    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(500);
    expect(body.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.title).toBe("Internal Server Error");
    // Ensure sensitive message or stack trace is completely sanitized
    expect(body.detail).not.toContain("Sensitive database connection password");
    expect(body.detail).toContain("unexpected internal server error occurred");
    expect(body.stack).toBeUndefined();
  });
});
