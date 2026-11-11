import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as loginPOST } from "../../src/app/api/auth/login/route";
import { POST as forgotPOST } from "../../src/app/api/auth/forgot-password/route";
import { POST as passkeyPOST } from "../../src/app/api/auth/passkey/verify/route";

const cookieMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
  createTenantSessionCookieOptions: vi.fn(),
}));
const botMocks = vi.hoisted(() => ({ verifyBotChallenge: vi.fn() }));
const loginMocks = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
}));
const resetMocks = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));
const passkeyMocks = vi.hoisted(() => ({
  verifyPasskeyCredential: vi.fn(),
  recordPasskeyVerification: vi.fn(),
}));

vi.mock("@/lib/auth-constants", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  SESSION_EPHEMERAL_MAX_AGE_SECONDS: 3600,
  SESSION_PERSISTENT_MAX_AGE_SECONDS: 604800,
  signSessionToken: cookieMocks.signSessionToken,
  encodeSessionPayload: cookieMocks.encodeSessionPayload,
  createSessionCookieOptions: cookieMocks.createSessionCookieOptions,
  createTenantSessionCookieOptions: cookieMocks.createTenantSessionCookieOptions,
}));
vi.mock("@/services/bot-defense.service", () => ({
  verifyBotChallenge: botMocks.verifyBotChallenge,
}));
vi.mock("@/services/login.service", () => ({
  authenticateWithPassword: loginMocks.authenticateWithPassword,
  recordSuccessfulLogin: loginMocks.recordSuccessfulLogin,
}));
vi.mock("@/services/password-reset.service", () => ({
  requestPasswordReset: resetMocks.requestPasswordReset,
}));
vi.mock("@/services/passkey.service", () => ({
  verifyPasskeyCredential: passkeyMocks.verifyPasskeyCredential,
  recordPasskeyVerification: passkeyMocks.recordPasskeyVerification,
}));
vi.mock("@/lib/origin", () => ({ resolveRequestOrigin: () => "https://app.example.com" }));

const EMAIL = "user@example.com";
const LOGIN_PATH = "https://app.example.com/api/auth/login";
const FORGOT_PATH = "https://app.example.com/api/auth/forgot-password";
const PASSKEY_PATH = "https://app.example.com/api/auth/passkey/verify";

const LOGIN_CONTEXT = {
  userId: "usr_1",
  email: EMAIL,
  userName: "User",
  organizationId: "org_1",
  organizationName: "Acme",
  roleName: "member",
  roleSlug: "member",
  permissions: ["branches:read"],
  onboardingStatus: "COMPLETED",
  themePreference: "system",
  hasMultipleWorkspaces: false,
};

const PASSKEY_CONTEXT = { ...LOGIN_CONTEXT, hasMultipleWorkspaces: false };

const PASSKEY_IDENTITY = {
  passkeyId: "pk_1",
  credentialId: "cred_1",
  deviceType: "singleDevice",
};

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.20",
      "user-agent": "vitest-agent",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const LOGIN_BODY = { email: "User@Example.com", password: "secret", keepSignedIn: false };

beforeEach(() => {
  vi.clearAllMocks();
  botMocks.verifyBotChallenge.mockResolvedValue(true);
  cookieMocks.encodeSessionPayload.mockReturnValue("payload");
  cookieMocks.signSessionToken.mockResolvedValue("signed-token");
  const hostOnlyCookie = {
    name: "__Host-bos_session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  };
  cookieMocks.createSessionCookieOptions.mockReturnValue(hostOnlyCookie);
  cookieMocks.createTenantSessionCookieOptions.mockReturnValue(hostOnlyCookie);
  loginMocks.recordSuccessfulLogin.mockResolvedValue(undefined);
  passkeyMocks.recordPasskeyVerification.mockResolvedValue(undefined);
});

describe("login route", () => {
  it("rejects an invalid payload", async () => {
    const response = await loginPOST(jsonRequest(LOGIN_PATH, {}));

    expect(response.status).toBe(400);
  });

  it("treats an unparseable body as an empty payload", async () => {
    const response = await loginPOST(
      jsonRequest(LOGIN_PATH, "{bad")
    );

    expect(response.status).toBe(400);
  });

  it("requires the bot challenge", async () => {
    botMocks.verifyBotChallenge.mockResolvedValue(false);

    const response = await loginPOST(
      jsonRequest(LOGIN_PATH, LOGIN_BODY)
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_VERIFICATION_FAILED" });
    expect(loginMocks.authenticateWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_credentials", 401],
    ["workspace_access_denied", 403],
    ["workspace_suspended", 403],
    ["workspace_archived", 403],
  ])("maps a %s failure", async (status, expectedStatus) => {
    loginMocks.authenticateWithPassword.mockResolvedValue({ status });

    const response = await loginPOST(
      jsonRequest(LOGIN_PATH, LOGIN_BODY)
    );

    expect(response.status).toBe(expectedStatus);
  });

  it("normalises the email and issues a session", async () => {
    loginMocks.authenticateWithPassword.mockResolvedValue({
      status: "authenticated",
      context: LOGIN_CONTEXT,
    });

    const response = await loginPOST(
      jsonRequest(LOGIN_PATH, LOGIN_BODY)
    );

    expect(response.status).toBe(200);
    expect(loginMocks.authenticateWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL, ipAddress: "198.51.100.20" })
    );
    expect(response.cookies.get("__Host-bos_session")?.value).toBe("signed-token");
    expect(loginMocks.recordSuccessfulLogin).toHaveBeenCalled();
  });

});

describe("login route session shape", () => {
  it("sends multi-workspace users to the chooser", async () => {
    loginMocks.authenticateWithPassword.mockResolvedValue({
      status: "authenticated",
      context: { ...LOGIN_CONTEXT, hasMultipleWorkspaces: true },
    });

    const response = await loginPOST(
      jsonRequest(LOGIN_PATH, LOGIN_BODY)
    );

    expect(await response.json()).toMatchObject({ redirectUrl: "/choose-tenant" });
  });

  it("keeps the session persistent when keepSignedIn is set", async () => {
    loginMocks.authenticateWithPassword.mockResolvedValue({
      status: "authenticated",
      context: LOGIN_CONTEXT,
    });

    await loginPOST(
      jsonRequest(LOGIN_PATH, { ...LOGIN_BODY, keepSignedIn: true })
    );

    expect(cookieMocks.encodeSessionPayload).toHaveBeenCalledWith(
      expect.objectContaining({ isEphemeral: false })
    );
  });

  it("returns 500 when authentication throws", async () => {
    loginMocks.authenticateWithPassword.mockRejectedValue(new Error("boom"));

    const response = await loginPOST(
      jsonRequest(LOGIN_PATH, LOGIN_BODY)
    );

    expect(response.status).toBe(500);
  });
});

describe("forgot-password route", () => {
  it("rejects an invalid email", async () => {
    const response = await forgotPOST(
      jsonRequest(FORGOT_PATH, { email: "nope" })
    );

    expect(response.status).toBe(400);
  });

  it("requires the bot challenge", async () => {
    botMocks.verifyBotChallenge.mockResolvedValue(false);

    const response = await forgotPOST(
      jsonRequest(FORGOT_PATH, {
        email: EMAIL,
      })
    );

    expect(response.status).toBe(403);
  });

  it("reports the rate-limit rejection with the supplied detail", async () => {
    resetMocks.requestPasswordReset.mockResolvedValue({
      status: "rate_limited",
      detail: "Too many requests",
      retryAfter: 30,
    });

    const response = await forgotPOST(
      jsonRequest(FORGOT_PATH, {
        email: "User@Example.com",
      })
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ detail: "Too many requests" });
  });

  it("reports a rate-limit rejection without a detail", async () => {
    resetMocks.requestPasswordReset.mockResolvedValue({
      status: "rate_limited",
      retryAfter: 30,
    });

    const response = await forgotPOST(
      jsonRequest(FORGOT_PATH, {
        email: EMAIL,
      })
    );

    expect(response.status).toBe(429);
  });

  it("dispatches the reset email for a known address", async () => {
    resetMocks.requestPasswordReset.mockResolvedValue({ status: "dispatched" });

    const response = await forgotPOST(
      jsonRequest(FORGOT_PATH, {
        email: "User@Example.com",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
  });

});

describe("forgot-password failures", () => {
  it("returns 500 when the service throws", async () => {
    resetMocks.requestPasswordReset.mockRejectedValue(new Error("boom"));

    const response = await forgotPOST(
      jsonRequest(FORGOT_PATH, {
        email: EMAIL,
      })
    );

    expect(response.status).toBe(500);
  });
});

describe("passkey verify route", () => {
  it("rejects an invalid payload", async () => {
    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, {})
    );

    expect(response.status).toBe(400);
  });

  it("requires the bot challenge", async () => {
    botMocks.verifyBotChallenge.mockResolvedValue(false);

    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, { id: "cred_1" })
    );

    expect(response.status).toBe(403);
  });

  it("returns 401 for an unknown credential", async () => {
    passkeyMocks.verifyPasskeyCredential.mockResolvedValue({ status: "not_found" });

    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, { id: "cred_1" })
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when workspace access is denied", async () => {
    passkeyMocks.verifyPasskeyCredential.mockResolvedValue({
      status: "workspace_access_denied",
    });

    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, { id: "cred_1" })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "WORKSPACE_ACCESS_DENIED" });
  });

  it("issues a session for a recognised passkey", async () => {
    passkeyMocks.verifyPasskeyCredential.mockResolvedValue({
      status: "verified",
      context: PASSKEY_CONTEXT,
      passkey: PASSKEY_IDENTITY,
    });

    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, { id: "cred_1" })
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get("__Host-bos_session")?.value).toBe("signed-token");
    expect(passkeyMocks.recordPasskeyVerification).toHaveBeenCalledWith(
      expect.objectContaining({ passkeyId: "pk_1", ipAddress: "198.51.100.20" })
    );
  });

});

describe("passkey verify session shape", () => {
  it("sends multi-workspace passkey users to the chooser", async () => {
    passkeyMocks.verifyPasskeyCredential.mockResolvedValue({
      status: "verified",
      context: { ...PASSKEY_CONTEXT, hasMultipleWorkspaces: true },
      passkey: PASSKEY_IDENTITY,
    });

    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, { id: "cred_1" })
    );

    expect(await response.json()).toMatchObject({ redirectUrl: "/choose-tenant" });
  });

  it("returns 500 when verification throws", async () => {
    passkeyMocks.verifyPasskeyCredential.mockRejectedValue(new Error("boom"));

    const response = await passkeyPOST(
      jsonRequest(PASSKEY_PATH, { id: "cred_1" })
    );

    expect(response.status).toBe(500);
  });
});