import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
  verifyAccountLinkingTicket: vi.fn(),
  getBetterAuthSecret: vi.fn(),
}));
const serviceMocks = vi.hoisted(() => ({ linkAccountWithPassword: vi.fn() }));

vi.mock("@suite/auth", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  getBetterAuthSecret: authMocks.getBetterAuthSecret,
  verifyAccountLinkingTicket: authMocks.verifyAccountLinkingTicket,
  signSessionToken: authMocks.signSessionToken,
  encodeSessionPayload: authMocks.encodeSessionPayload,
  createSessionCookieOptions: authMocks.createSessionCookieOptions,
}));
vi.mock("@/services/link-account.service", () => ({
  linkAccountWithPassword: serviceMocks.linkAccountWithPassword,
}));

const { GET, POST } = await import("../../src/app/api/auth/link-account/route");

const LINK_CONTEXT = {
  userId: "usr_1",
  email: "user@example.com",
  userName: "User",
  organizationId: "org_1",
  organizationName: "Acme",
  roleName: "member",
  permissions: ["branches:read"],
  onboardingStatus: "COMPLETED",
  themePreference: "system",
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getBetterAuthSecret.mockReturnValue("secret");
  authMocks.encodeSessionPayload.mockReturnValue("payload");
  authMocks.signSessionToken.mockResolvedValue("signed-token");
  authMocks.createSessionCookieOptions.mockReturnValue({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
});

describe("link-account GET", () => {
  it("requires the ticket query parameter", async () => {
    const response = await GET(new NextRequest("https://app.example.com/api/auth/link-account"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TICKET" });
  });

  it("rejects an invalid ticket", async () => {
    authMocks.verifyAccountLinkingTicket.mockReturnValue(null);

    const response = await GET(
      new NextRequest("https://app.example.com/api/auth/link-account?ticket=abc")
    );

    expect(response.status).toBe(400);
  });

  it("describes the linking ticket", async () => {
    authMocks.verifyAccountLinkingTicket.mockReturnValue({
      email: "user@example.com",
      providerId: "google",
      name: "User",
      image: "https://img.example.com/u.png",
    });

    const response = await GET(
      new NextRequest("https://app.example.com/api/auth/link-account?ticket=abc")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: true, providerId: "google" });
  });
});

function linkRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/link-account", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.7, 10.0.0.1",
      "user-agent": "vitest-agent",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("link-account POST", () => {
  it("rejects an invalid payload", async () => {
    const response = await POST(linkRequest({ ticket: "" }));

    expect(response.status).toBe(400);
    expect(serviceMocks.linkAccountWithPassword).not.toHaveBeenCalled();
  });

  it("treats an unparseable body as an empty payload", async () => {
    const response = await POST(linkRequest("{bad"));

    expect(response.status).toBe(400);
  });

  it("maps a rate limit rejection", async () => {
    serviceMocks.linkAccountWithPassword.mockResolvedValue({
      status: "rate_limited",
      retryAfter: 30,
    });

    const response = await POST(linkRequest({ ticket: "t", password: "p" }));

    expect(response.status).toBe(429);
  });

  it("maps an invalid ticket rejection", async () => {
    serviceMocks.linkAccountWithPassword.mockResolvedValue({ status: "invalid_ticket" });

    const response = await POST(linkRequest({ ticket: "t", password: "p" }));

    expect(response.status).toBe(400);
  });

  it("maps an invalid password rejection", async () => {
    serviceMocks.linkAccountWithPassword.mockResolvedValue({ status: "invalid_password" });

    const response = await POST(linkRequest({ ticket: "t", password: "p" }));

    expect(response.status).toBe(401);
  });

  it("maps an account-not-found rejection", async () => {
    serviceMocks.linkAccountWithPassword.mockResolvedValue({ status: "account_not_found" });

    const response = await POST(linkRequest({ ticket: "t", password: "p" }));

    expect(response.status).toBe(404);
  });

  it("maps a user-not-found rejection", async () => {
    serviceMocks.linkAccountWithPassword.mockResolvedValue({ status: "user_not_found" });

    const response = await POST(linkRequest({ ticket: "t", password: "p" }));

    expect(response.status).toBe(404);
  });

});

describe("link-account POST success", () => {
  it("passes the parsed credentials to the service and links the account", async () => {
    serviceMocks.linkAccountWithPassword.mockResolvedValue({
      status: "linked",
      context: LINK_CONTEXT,
    });

    const response = await POST(linkRequest({ ticket: "ticket", password: "password" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(serviceMocks.linkAccountWithPassword).toHaveBeenCalledWith({
      ticket: "ticket",
      password: "password",
      clientIp: "198.51.100.7",
      userAgent: "vitest-agent",
    });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.linkAccountWithPassword.mockRejectedValue(new Error("boom"));

    const response = await POST(linkRequest({ ticket: "t", password: "p" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
