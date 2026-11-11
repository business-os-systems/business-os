import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callbackGET } from "../../src/app/api/auth/callback/[provider]/route";
import { GET as ssoGET } from "../../src/app/api/auth/sso/[id]/login/route";

const authMocks = vi.hoisted(() => ({
  exchangeOAuthCode: vi.fn(),
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
  createTenantSessionCookieOptions: vi.fn(),
}));
const oauthMocks = vi.hoisted(() => ({
  resolveOAuthLogin: vi.fn(),
  recordOAuthLoginAudit: vi.fn(),
}));
const ssoMocks = vi.hoisted(() => ({ getSsoConnection: vi.fn() }));

vi.mock("@suite/auth", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  SESSION_EPHEMERAL_MAX_AGE_SECONDS: 3600,
  exchangeOAuthCode: authMocks.exchangeOAuthCode,
  signSessionToken: authMocks.signSessionToken,
  encodeSessionPayload: authMocks.encodeSessionPayload,
  createSessionCookieOptions: authMocks.createSessionCookieOptions,
  createTenantSessionCookieOptions: authMocks.createTenantSessionCookieOptions,
}));
vi.mock("@/services/oauth-callback.service", () => ({
  resolveOAuthLogin: oauthMocks.resolveOAuthLogin,
  recordOAuthLoginAudit: oauthMocks.recordOAuthLoginAudit,
}));
vi.mock("@/services/sso.service", () => ({ getSsoConnection: ssoMocks.getSsoConnection }));
vi.mock("@/lib/origin", () => ({ resolveRequestOrigin: () => "https://app.example.com" }));

const CALLBACK_PATH = "/api/auth/callback/google?state=state-1&code=abc";
const OAUTH_FAILED = "error=oauth_failed";
const SSO_PATH = "/api/auth/sso/conn_1/login";
const CONNECTION_ID = "conn_1";

const OAUTH_CONTEXT = {
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

function callbackRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://app.example.com" + path, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.encodeSessionPayload.mockReturnValue("payload");
  authMocks.signSessionToken.mockResolvedValue("signed-token");
  const hostOnlyCookie = {
    name: "__Host-bos_session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3599,
  };
  authMocks.createSessionCookieOptions.mockReturnValue(hostOnlyCookie);
  authMocks.createTenantSessionCookieOptions.mockReturnValue(hostOnlyCookie);
  oauthMocks.recordOAuthLoginAudit.mockResolvedValue(undefined);
});

function withStateCookie(path: string): NextRequest {
  const request = callbackRequest(path);
  request.cookies.set("oauth_state", "state-1");
  return request;
}

describe("OAuth callback route", () => {
  it("redirects to the cancelled notice when the provider reports an error", async () => {
    const response = await callbackGET(callbackRequest("/api/auth/callback/google?error=denied"), {
      params: Promise.resolve({ provider: "Google" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=oauth_cancelled");
  });

  it("rejects a mismatched state", async () => {
    const response = await callbackGET(
      callbackRequest("/api/auth/callback/google?state=other&code=abc"),
      { params: Promise.resolve({ provider: "google" }) }
    );

    expect(response.headers.get("location")).toContain(OAUTH_FAILED);
  });

  it("rejects a missing state cookie", async () => {
    const response = await callbackGET(
      callbackRequest(CALLBACK_PATH),
      { params: Promise.resolve({ provider: "google" }) }
    );

    expect(response.headers.get("location")).toContain(OAUTH_FAILED);
  });

  it("rejects a missing authorization code", async () => {
    const response = await callbackGET(
      withStateCookie("/api/auth/callback/google?state=state-1"),
      { params: Promise.resolve({ provider: "google" }) }
    );

    expect(response.headers.get("location")).toContain(OAUTH_FAILED);
  });

});

describe("OAuth callback session issuance", () => {
  it("redirects to account linking when the identity collides", async () => {
    authMocks.exchangeOAuthCode.mockResolvedValue({ profile: {} });
    oauthMocks.resolveOAuthLogin.mockResolvedValue({
      status: "account_collision",
      ticket: "ticket-1",
    });

    const response = await callbackGET(
      withStateCookie(CALLBACK_PATH),
      { params: Promise.resolve({ provider: "google" }) }
    );

    expect(response.headers.get("location")).toContain("/link-account?ticket=ticket-1");
  });

  it("issues a session and clears the state cookie on success", async () => {
    authMocks.exchangeOAuthCode.mockResolvedValue({ profile: {} });
    oauthMocks.resolveOAuthLogin.mockResolvedValue({ status: "resolved", context: OAUTH_CONTEXT });

    const response = await callbackGET(
      withStateCookie(CALLBACK_PATH),
      { params: Promise.resolve({ provider: " Google " }) }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/dashboard");
    expect(response.cookies.get("__Host-bos_session")?.value).toBe("signed-token");
    expect(authMocks.exchangeOAuthCode).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", code: "abc" })
    );
    expect(oauthMocks.recordOAuthLoginAudit).toHaveBeenCalled();
  });

  it("sends multi-workspace logins to the chooser", async () => {
    authMocks.exchangeOAuthCode.mockResolvedValue({ profile: {} });
    oauthMocks.resolveOAuthLogin.mockResolvedValue({
      status: "resolved",
      context: { ...OAUTH_CONTEXT, hasMultipleWorkspaces: true },
    });

    const response = await callbackGET(
      withStateCookie(CALLBACK_PATH),
      { params: Promise.resolve({ provider: "google" }) }
    );

    expect(response.headers.get("location")).toContain("/choose-tenant");
  });

  it("redirects to the failure notice when the exchange throws", async () => {
    authMocks.exchangeOAuthCode.mockRejectedValue(new Error("provider down"));

    const response = await callbackGET(
      withStateCookie(CALLBACK_PATH),
      { params: Promise.resolve({ provider: "google" }) }
    );

    expect(response.headers.get("location")).toContain(OAUTH_FAILED);
  });
});

describe("SSO login route", () => {
  const htmlHeaders = { accept: "text/html" };

  it("redirects HTML clients to the login page when the connection is unknown", async () => {
    ssoMocks.getSsoConnection.mockResolvedValue(null);

    const response = await ssoGET(callbackRequest(SSO_PATH, htmlHeaders), {
      params: Promise.resolve({ id: CONNECTION_ID }),
    });

    expect(response.headers.get("location")).toContain("error=sso_not_found");
  });

  it("returns a problem for API clients when the connection is unknown", async () => {
    ssoMocks.getSsoConnection.mockResolvedValue(null);

    const response = await ssoGET(callbackRequest(SSO_PATH), {
      params: Promise.resolve({ id: CONNECTION_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("redirects to the identity provider when an auth URL is configured", async () => {
    ssoMocks.getSsoConnection.mockResolvedValue({
      authUrl: "https://idp.example.com/sso?x=1",
      domain: "example.com",
      organizationName: "Acme",
    });

    const response = await ssoGET(callbackRequest(SSO_PATH), {
      params: Promise.resolve({ id: CONNECTION_ID }),
    });

    expect(response.headers.get("location")).toBe("https://idp.example.com/sso?x=1");
  });

  it("redirects HTML clients when the IdP is not configured", async () => {
    ssoMocks.getSsoConnection.mockResolvedValue({
      authUrl: null,
      domain: "example.com",
      organizationName: "Acme",
    });

    const response = await ssoGET(callbackRequest(SSO_PATH, htmlHeaders), {
      params: Promise.resolve({ id: CONNECTION_ID }),
    });

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=sso_unconfigured");
    expect(location).toContain("domain=example.com");
  });

  it("returns a 501 problem for API clients when the IdP is not configured", async () => {
    ssoMocks.getSsoConnection.mockResolvedValue({
      authUrl: null,
      domain: "example.com",
      organizationName: "Acme",
    });

    const response = await ssoGET(callbackRequest(SSO_PATH), {
      params: Promise.resolve({ id: CONNECTION_ID }),
    });

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ code: "SSO_IDP_NOT_CONFIGURED" });
  });

  it("returns 500 when the connection lookup throws", async () => {
    ssoMocks.getSsoConnection.mockRejectedValue(new Error("boom"));

    const response = await ssoGET(callbackRequest(SSO_PATH), {
      params: Promise.resolve({ id: CONNECTION_ID }),
    });

    expect(response.status).toBe(500);
  });
});