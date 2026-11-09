import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
}));
const serviceMocks = vi.hoisted(() => ({ resetPasswordWithToken: vi.fn() }));

vi.mock("@/lib/auth-constants", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  signSessionToken: sessionMocks.signSessionToken,
  encodeSessionPayload: sessionMocks.encodeSessionPayload,
  createSessionCookieOptions: sessionMocks.createSessionCookieOptions,
}));
vi.mock("@/services/password-reset.service", () => ({
  resetPasswordWithToken: serviceMocks.resetPasswordWithToken,
}));

const { POST } = await import("../../src/app/api/auth/reset-password/route");

function resetRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  token: "reset-token",
  newPassword: "SecurePassword123!",
  confirmPassword: "SecurePassword123!",
};

const RESET_CONTEXT = {
  userId: "usr_1",
  email: "user@example.com",
  userName: "User",
  organizationId: "org_1",
  organizationName: "Acme",
  roleName: "member",
  permissions: ["branches:read"],
  onboardingStatus: "COMPLETED",
  themePreference: "system",
  hasMultipleWorkspaces: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.encodeSessionPayload.mockReturnValue("payload");
  sessionMocks.signSessionToken.mockResolvedValue("signed-token");
  sessionMocks.createSessionCookieOptions.mockReturnValue({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
});

describe("reset-password route validation", () => {
  it("rejects mismatched passwords", async () => {
    const response = await POST(resetRequest({ ...VALID_BODY, confirmPassword: "OtherPassword123!" }));

    expect(response.status).toBe(400);
    expect(serviceMocks.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("treats an unparseable body as an empty payload", async () => {
    const response = await POST(resetRequest("{bad-json"));

    expect(response.status).toBe(400);
  });
});

describe("reset-password route outcomes", () => {
  it("returns a rate-limit problem", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({
      status: "rate_limited",
      retryAfter: 60,
    });

    const response = await POST(resetRequest(VALID_BODY));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "RATE_LIMIT_EXCEEDED" });
  });

  it("returns the supplied rate-limit detail when present", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({
      status: "rate_limited",
      detail: "Slow down",
      retryAfter: 60,
    });

    const response = await POST(resetRequest(VALID_BODY));

    expect(await response.json()).toMatchObject({ detail: "Slow down" });
  });

  it("returns 410 for an expired token", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({ status: "expired_token" });

    const response = await POST(resetRequest(VALID_BODY));

    expect(response.status).toBe(410);
  });

  it("returns 400 for a complexity failure", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({
      status: "complexity_failed",
      detail: "Add a symbol",
    });

    const response = await POST(resetRequest(VALID_BODY));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: "Add a symbol" });
  });

  it("returns 400 for an invalid token", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({ status: "invalid_token" });

    const response = await POST(resetRequest(VALID_BODY));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

});

describe("reset-password route session issuance", () => {
  it("issues a session cookie for a successful reset", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({
      status: "reset",
      context: RESET_CONTEXT,
    });

    const response = await POST(resetRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, redirectUrl: "/dashboard" });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
  });

  it("sends multi-workspace users to the tenant chooser", async () => {
    serviceMocks.resetPasswordWithToken.mockResolvedValue({
      status: "reset",
      context: { ...RESET_CONTEXT, hasMultipleWorkspaces: true },
    });

    const response = await POST(resetRequest(VALID_BODY));

    expect(await response.json()).toMatchObject({ redirectUrl: "/choose-tenant" });
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.resetPasswordWithToken.mockRejectedValue(new Error("boom"));

    const response = await POST(resetRequest(VALID_BODY));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
