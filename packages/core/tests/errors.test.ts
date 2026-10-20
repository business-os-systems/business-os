import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  TenantMismatchError,
  UnauthorizedError,
  ValidationError,
  isAppError,
  createProblemEnvelope,
  createSuccessEnvelope,
} from "../src/index.js";

describe("@suite/core - RFC 7807 Problem Details Error Hierarchy", () => {
  it("serializes base AppError to compliant RFC 7807 JSON envelope", () => {
    const error = new AppError({
      status: 400,
      code: "BAD_REQUEST",
      title: "Bad Request",
      detail: "Malformed input parameters received",
      instance: "/api/v1/checkout",
      invalidParams: [{ name: "email", reason: "Invalid format", code: "INVALID_EMAIL" }],
    });

    expect(isAppError(error)).toBe(true);
    expect(error.status).toBe(400);

    const problem = error.toProblemDetails("req_trace_123");

    expect(problem.type).toBe("/errors/bad-request");
    expect(problem.title).toBe("Bad Request");
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe("Malformed input parameters received");
    expect(problem.code).toBe("BAD_REQUEST");
    expect(problem.instance).toBe("/api/v1/checkout");
    expect(problem.requestId).toBe("req_trace_123");
    expect(problem.invalidParams).toHaveLength(1);
    expect(problem.invalidParams?.[0]?.name).toBe("email");
    expect(problem).toHaveProperty("timestamp");
    expect(new Date(problem.timestamp).toISOString()).toBe(problem.timestamp);
  });

  it("handles NotFoundError with default and custom values", () => {
    const default404 = new NotFoundError();
    expect(default404.status).toBe(404);
    expect(default404.code).toBe("NOT_FOUND");
    expect(default404.title).toBe("Resource Not Found");

    const custom404 = new NotFoundError("Room 101 not found", {
      code: "ROOM_NOT_FOUND",
      instance: "/api/v1/rooms/101",
    });
    expect(custom404.status).toBe(404);
    expect(custom404.code).toBe("ROOM_NOT_FOUND");
    expect(custom404.detail).toBe("Room 101 not found");
    expect(custom404.instance).toBe("/api/v1/rooms/101");
  });

  it("handles UnauthorizedError and ForbiddenError", () => {
    const authError = new UnauthorizedError();
    expect(authError.status).toBe(401);
    expect(authError.code).toBe("UNAUTHORIZED");

    const forbidden = new ForbiddenError();
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe("FORBIDDEN");
  });

  it("handles ConflictError with concurrency/state details", () => {
    const conflict = new ConflictError("Room already occupied for selected dates", {
      code: "RESERVATION_CONFLICT",
    });
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("RESERVATION_CONFLICT");
  });

  it("handles ValidationError with granular field errors", () => {
    const validation = new ValidationError("Payload failed validation", [
      { name: "guestCount", reason: "Must be at least 1" },
      { name: "nightAuditHour", reason: "Must be between 0 and 23" },
    ]);
    expect(validation.status).toBe(422);
    expect(validation.code).toBe("VALIDATION_ERROR");
    expect(validation.invalidParams).toHaveLength(2);
  });

  it("handles TenantMismatchError for cross-tenant isolation enforcement", () => {
    const tenantViolation = new TenantMismatchError();
    expect(tenantViolation.status).toBe(403);
    expect(tenantViolation.code).toBe("TENANT_MISMATCH");
    expect(tenantViolation.title).toBe("Tenant Isolation Violation");
  });

  it("handles RateLimitError with retryAfterSeconds", () => {
    const rateLimit = new RateLimitError("Rate limit exceeded on shift PIN", 300);
    expect(rateLimit.status).toBe(429);
    expect(rateLimit.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(rateLimit.retryAfterSeconds).toBe(300);
  });

  it("handles InternalServerError without leaking sensitive internals in title", () => {
    const internal = new InternalServerError("Database socket dropped unexpectedly", {
      cause: new Error("ECONNREFUSED"),
    });
    expect(internal.status).toBe(500);
    expect(internal.code).toBe("INTERNAL_SERVER_ERROR");
    expect(internal.cause).toBeDefined();
  });

  it("creates compliant RFC 7807 problem envelope with Option A relative URI", () => {
    const envelope = createProblemEnvelope({
      status: 422,
      code: "PASSWORD_REQUIRED",
      title: "Password Required",
      detail: "A password is required to set up your account and join the workspace.",
    });

    expect(envelope.init.status).toBe(422);
    expect(envelope.init.headers["Content-Type"]).toBe("application/problem+json");
    expect(envelope.body.type).toBe("/errors/password-required");
    expect(envelope.body.code).toBe("PASSWORD_REQUIRED");
    expect(envelope.body.status).toBe(422);
  });

  it("creates compliant JSON success envelope with custom status and headers", () => {
    const envelope = createSuccessEnvelope({
      data: { success: true, count: 42 },
      status: 201,
      headers: { "x-custom-header": "test-val" },
    });

    expect(envelope.init.status).toBe(201);
    expect(envelope.init.headers["Content-Type"]).toBe("application/json");
    expect(envelope.init.headers["x-custom-header"]).toBe("test-val");
    expect(envelope.body).toEqual({ success: true, count: 42 });
  });
});
