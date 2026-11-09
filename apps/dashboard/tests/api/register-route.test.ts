import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/auth/register/route";

const serviceMocks = vi.hoisted(() => ({
  registerCredentialAccount: vi.fn(),
}));
const botMocks = vi.hoisted(() => ({ verifyBotChallenge: vi.fn() }));
const sessionMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
}));

vi.mock("@/services/register.service", () => ({
  registerCredentialAccount: serviceMocks.registerCredentialAccount,
  deriveNameFromEmail: vi.fn(),
}));
vi.mock("@/services/bot-defense.service", () => ({
  verifyBotChallenge: botMocks.verifyBotChallenge,
}));
vi.mock("@/lib/auth-constants", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  signSessionToken: sessionMocks.signSessionToken,
  encodeSessionPayload: sessionMocks.encodeSessionPayload,
  createSessionCookieOptions: sessionMocks.createSessionCookieOptions,
}));
vi.mock("@/lib/origin", () => ({
  resolveRequestOrigin: () => "https://app.example.com",
}));
vi.mock("@suite/auth/password", () => ({
  validatePasswordComplexity: (password: string) => ({
    isValid: password === "SecurePassword123!",
  }),
}));

const VALID_BODY = {
  email: "New.User@Company.com",
  password: "SecurePassword123!",
  name: "New User",
  turnstileToken: "turnstile-token",
};

function registerRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.com/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  botMocks.verifyBotChallenge.mockResolvedValue(true);
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

describe("register route validation", () => {
  it("rejects an invalid payload with a problem response", async () => {
    const response = await POST(registerRequest({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 400 });
    expect(serviceMocks.registerCredentialAccount).not.toHaveBeenCalled();
  });

  it("treats an unparseable body as an empty payload", async () => {
    const request = new Request("https://app.example.com/api/auth/register", {
      method: "POST",
      body: "{not-json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

describe("register route password policy", () => {
  it("rejects a weak password before touching the service", async () => {
    const response = await POST(
      registerRequest({ ...VALID_BODY, password: "short-password" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "WEAK_PASSWORD" });
    expect(serviceMocks.registerCredentialAccount).not.toHaveBeenCalled();
  });
});

describe("register route bot defence", () => {
  it("returns 403 when the bot challenge fails", async () => {
    botMocks.verifyBotChallenge.mockResolvedValue(false);

    const response = await POST(
      registerRequest(VALID_BODY, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOT_VERIFICATION_FAILED" });
    expect(botMocks.verifyBotChallenge).toHaveBeenCalledWith({
      token: "turnstile-token",
      clientIp: "203.0.113.9",
    });
  });

  it("passes an absent client IP through to the challenge", async () => {
    serviceMocks.registerCredentialAccount.mockResolvedValue({ status: "existing_account" });

    await POST(registerRequest(VALID_BODY));

    expect(botMocks.verifyBotChallenge).toHaveBeenCalledWith({
      token: "turnstile-token",
      clientIp: undefined,
    });
  });
});

describe("register route outcomes", () => {
  it("returns the pending-verification response for a known email", async () => {
    serviceMocks.registerCredentialAccount.mockResolvedValue({ status: "existing_account" });

    const response = await POST(registerRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redirectUrl: "/login?registered=pending" });
    expect(sessionMocks.signSessionToken).not.toHaveBeenCalled();
  });

  it("normalises the email and returns a 201 with a session cookie", async () => {
    serviceMocks.registerCredentialAccount.mockResolvedValue({
      status: "created",
      user: { id: "usr_1", email: "new.user@company.com", name: "New User" },
    });

    const response = await POST(registerRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(serviceMocks.registerCredentialAccount).toHaveBeenCalledWith({
      email: "new.user@company.com",
      password: "SecurePassword123!",
      name: "New User",
      origin: "https://app.example.com",
    });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
    expect(sessionMocks.encodeSessionPayload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr_1", onboardingStatus: "IN_PROGRESS" })
    );
  });

  it("omits the optional name when the payload has none", async () => {
    serviceMocks.registerCredentialAccount.mockResolvedValue({ status: "existing_account" });

    await POST(registerRequest({ email: VALID_BODY.email, password: VALID_BODY.password }));

    expect(serviceMocks.registerCredentialAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: undefined })
    );
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.registerCredentialAccount.mockRejectedValue(new Error("database down"));

    const response = await POST(registerRequest(VALID_BODY));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
