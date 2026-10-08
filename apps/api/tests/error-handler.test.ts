import { describe, it, expect } from "vitest";
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

describe("Global RFC 7807 Error Handler", () => {
  const setupErrorApp = () => {
    const testApp = new OpenAPIHono();
    testApp.use("*", requestIdMiddleware());
    testApp.onError(globalErrorHandler);

    testApp.get("/test-not-found", () => {
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

    testApp.get("/test-unhandled", () => {
      throw new Error("Sensitive database connection password leaked in stack trace!");
    });

    return testApp;
  };

  const app = setupErrorApp();

  it("handles NotFoundError with RFC 7807 problem details format and status 404", async () => {
    const res = await app.request("/test-not-found", {
      headers: { "x-request-id": "req_custom_id_123" },
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");

    const body = (await res.json()) as ExtendedProblemDetails;
    expect(body.status).toBe(404);
    expect(body.title).toBe("Resource Not Found");
    expect(body.code).toBe("RESOURCE_NOT_FOUND");
    expect(body.detail).toBe("Resource with id 123 not found");
    expect(body.instance).toBe("/test-not-found");
    expect(body.requestId).toBe("req_custom_id_123");
    expect(typeof body.timestamp).toBe("string");
  });

  it("handles ValidationError with invalidParams list and status 422", async () => {
    const res = await app.request("/test-validation");

    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");

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
    expect(res.headers.get("content-type")).toContain("application/problem+json");

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

  it("masks unhandled exceptions with safe generic 500 error and NO stack trace leakage", async () => {
    const res = await app.request("/test-unhandled");

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/problem+json");

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
