import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../src/app/api/auth/verify-email/confirm/route";

const ORIGIN = "https://app.example.com";
const LOCATION_HEADER = "location";
const CONFIRM_PATH = "/api/auth/verify-email/confirm";
const EMAIL = "user@example.com";

const serviceMocks = vi.hoisted(() => ({ confirmEmailVerification: vi.fn() }));

vi.mock("@/services/email-verification.service", () => ({
  confirmEmailVerification: serviceMocks.confirmEmailVerification,
}));

function confirmRequest(path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(ORIGIN + path), {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("email verification GET", () => {
  it("redirects to the expired page when the token is missing", async () => {
    const response = await GET(confirmRequest(CONFIRM_PATH));

    expect(response.status).toBe(307);
    expect(response.headers.get(LOCATION_HEADER)).toContain("/verify-expired?error=missing_token");
  });

  it("redirects to the dashboard when the token verifies", async () => {
    serviceMocks.confirmEmailVerification.mockResolvedValue({ status: "verified" });

    const response = await GET(confirmRequest(CONFIRM_PATH + "?token=abc"));

    expect(response.headers.get(LOCATION_HEADER)).toContain("/dashboard?verified=true");
  });

  it("redirects to the expired page with the email when the token expired", async () => {
    serviceMocks.confirmEmailVerification.mockResolvedValue({
      status: "expired",
      email: EMAIL,
    });

    const response = await GET(confirmRequest(CONFIRM_PATH + "?token=abc"));

    const location = response.headers.get(LOCATION_HEADER) ?? "";
    expect(location).toContain("expired=true");
    expect(location).toContain("user%40example.com");
  });

  it("redirects to the expired page for an invalid token", async () => {
    serviceMocks.confirmEmailVerification.mockResolvedValue({ status: "invalid" });

    const response = await GET(confirmRequest(CONFIRM_PATH + "?token=abc"));

    expect(response.headers.get(LOCATION_HEADER)).toContain("error=invalid_token");
  });
});

describe("email verification POST", () => {
  it("rejects a missing token", async () => {
    const response = await POST(confirmRequest(CONFIRM_PATH, {}));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("confirms a valid token", async () => {
    serviceMocks.confirmEmailVerification.mockResolvedValue({
      status: "verified",
      email: EMAIL,
    });

    const response = await POST(
      confirmRequest(CONFIRM_PATH, { token: "abc" })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, email: EMAIL });
  });

  it("returns 410 for an expired token", async () => {
    serviceMocks.confirmEmailVerification.mockResolvedValue({
      status: "expired",
      email: EMAIL,
    });

    const response = await POST(
      confirmRequest(CONFIRM_PATH, { token: "abc" })
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("returns 400 for an invalid token", async () => {
    serviceMocks.confirmEmailVerification.mockResolvedValue({ status: "invalid" });

    const response = await POST(
      confirmRequest(CONFIRM_PATH, { token: "abc" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.confirmEmailVerification.mockRejectedValue(new Error("boom"));

    const response = await POST(
      confirmRequest(CONFIRM_PATH, { token: "abc" })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
