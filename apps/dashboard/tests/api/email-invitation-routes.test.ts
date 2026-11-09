import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "@suite/core/errors";
import { POST as verifyRequestPOST } from "../../src/app/api/auth/verify-email/request/route";
import { GET as invitationGET, POST as invitationPOST } from "../../src/app/api/v1/auth/invitation/accept/route";

const authMocks = vi.hoisted(() => ({
  verifySessionToken: vi.fn(),
  decodeSessionPayload: vi.fn(),
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
}));
const emailMocks = vi.hoisted(() => ({ requestEmailVerification: vi.fn() }));
const invitationMocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  getInvitationDetails: vi.fn(),
}));
const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));

vi.mock("@suite/auth", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  verifySessionToken: authMocks.verifySessionToken,
  decodeSessionPayload: authMocks.decodeSessionPayload,
  signSessionToken: authMocks.signSessionToken,
  encodeSessionPayload: authMocks.encodeSessionPayload,
  createSessionCookieOptions: authMocks.createSessionCookieOptions,
}));
vi.mock("@/services/email-verification.service", () => ({
  requestEmailVerification: emailMocks.requestEmailVerification,
}));
vi.mock("@/services/invitation.service", () => invitationMocks);
vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/lib/origin", () => ({ resolveRequestOrigin: () => "https://app.example.com" }));

const VERIFY_REQUEST_PATH = "/api/auth/verify-email/request";
const INVITATION_PATH = "/api/v1/auth/invitation/accept";
const INVITEE_EMAIL = "invitee@example.com";

const DETAILS = {
  token: "tkn",
  email: INVITEE_EMAIL,
  name: "Invitee",
  organizationName: "Acme",
  roleName: "Member",
  branchName: "HQ",
  hasPassword: true,
  expiresAt: new Date("2026-12-01T00:00:00.000Z"),
};

const ACCEPTED = {
  status: "accepted",
  organizationId: "org_1",
  organizationName: "Acme",
  userId: "usr_1",
  userEmail: INVITEE_EMAIL,
  userName: "Invitee",
  roleSlug: "member",
  permissions: ["branches:read"],
  assignedBranchId: "br_1",
};

function postRequest(url: string, body: unknown): NextRequest {
  return new NextRequest("https://app.example.com" + url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.signSessionToken.mockResolvedValue("signed-token");
  authMocks.encodeSessionPayload.mockReturnValue("payload");
  authMocks.createSessionCookieOptions.mockReturnValue({
    name: "bos_session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: false, response: new Response("no") });
});

describe("verify-email request route", () => {
  it("requires a target email", async () => {
    authMocks.verifySessionToken.mockResolvedValue(false);

    const response = await verifyRequestPOST(
      postRequest(VERIFY_REQUEST_PATH, {})
    );

    expect(response.status).toBe(400);
  });

  it("uses the email from a valid session cookie", async () => {
    authMocks.verifySessionToken.mockResolvedValue(true);
    authMocks.decodeSessionPayload.mockReturnValue({ email: "Session@Example.com" });
    emailMocks.requestEmailVerification.mockResolvedValue({ status: "dispatched" });

    const request = postRequest(VERIFY_REQUEST_PATH, {});
    request.cookies.set("bos_session", "session-token");

    const response = await verifyRequestPOST(request);

    expect(response.status).toBe(200);
    expect(emailMocks.requestEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ email: "session@example.com" })
    );
  });

  it("ignores an invalid session cookie and uses the body email", async () => {
    authMocks.verifySessionToken.mockResolvedValue(false);
    emailMocks.requestEmailVerification.mockResolvedValue({ status: "dispatched" });

    const request = postRequest(VERIFY_REQUEST_PATH, { email: "body@example.com" });
    request.cookies.set("bos_session", "stale-token");

    const response = await verifyRequestPOST(request);

    expect(response.status).toBe(200);
    expect(emailMocks.requestEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ email: "body@example.com" })
    );
  });

  it("ignores a session without an email claim", async () => {
    authMocks.verifySessionToken.mockResolvedValue(true);
    authMocks.decodeSessionPayload.mockReturnValue(null);
    emailMocks.requestEmailVerification.mockResolvedValue({ status: "dispatched" });

    const request = postRequest(VERIFY_REQUEST_PATH, { email: "body@example.com" });
    request.cookies.set("bos_session", "session-token");

    const response = await verifyRequestPOST(request);

    expect(response.status).toBe(200);
  });

});

describe("verify-email request dispatch failures", () => {
  it("returns the rate-limit problem with the supplied detail", async () => {
    emailMocks.requestEmailVerification.mockResolvedValue({
      status: "rate_limited",
      detail: "Slow down",
      retryAfter: 60,
    });

    const response = await verifyRequestPOST(
      postRequest(VERIFY_REQUEST_PATH, { email: "user@example.com" })
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ detail: "Slow down" });
  });

  it("returns the default rate-limit detail", async () => {
    emailMocks.requestEmailVerification.mockResolvedValue({
      status: "rate_limited",
      retryAfter: 60,
    });

    const response = await verifyRequestPOST(
      postRequest(VERIFY_REQUEST_PATH, { email: "user@example.com" })
    );

    expect(response.status).toBe(429);
  });

  it("returns 500 when the dispatch throws", async () => {
    emailMocks.requestEmailVerification.mockRejectedValue(new Error("boom"));

    const response = await verifyRequestPOST(
      postRequest(VERIFY_REQUEST_PATH, { email: "user@example.com" })
    );

    expect(response.status).toBe(500);
  });
});

describe("invitation accept GET", () => {
  it("requires the token query parameter", async () => {
    const response = await invitationGET(
      new NextRequest("https://app.example.com/api/v1/auth/invitation/accept")
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ["not_found", 404],
    ["already_accepted", 409],
    ["inactive", 409],
    ["expired", 410],
    ["revoked", 403],
  ])("maps a %s invitation to %i", async (status, expected) => {
    invitationMocks.getInvitationDetails.mockResolvedValue({
      status,
      invitationStatus: "SUSPENDED",
    });

    const response = await invitationGET(
      new NextRequest("https://app.example.com/api/v1/auth/invitation/accept?token=tkn")
    );

    expect(response.status).toBe(expected);
  });

  it("returns the invitation details", async () => {
    invitationMocks.getInvitationDetails.mockResolvedValue({ status: "valid", details: DETAILS });

    const response = await invitationGET(
      new NextRequest("https://app.example.com/api/v1/auth/invitation/accept?token=tkn")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ isValid: true, roleName: "Member" });
  });

  it("returns 500 when the lookup throws", async () => {
    invitationMocks.getInvitationDetails.mockRejectedValue(new Error("boom"));

    const response = await invitationGET(
      new NextRequest("https://app.example.com/api/v1/auth/invitation/accept?token=tkn")
    );

    expect(response.status).toBe(500);
  });
});

describe("invitation accept POST", () => {
  it("rejects an invalid payload", async () => {
    const response = await invitationPOST(
      postRequest(INVITATION_PATH, { token: "" })
    );

    expect(response.status).toBe(400);
  });

  it("treats an unparseable body as a null payload", async () => {
    const response = await invitationPOST(
      postRequest(INVITATION_PATH, "{bad")
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ["not_found", 404],
    ["already_accepted", 409],
    ["inactive", 409],
    ["expired", 410],
    ["revoked", 403],
    ["password_required", 422],
    ["email_mismatch", 403],
  ])("maps a %s acceptance to %i", async (status, expected) => {
    invitationMocks.acceptInvitation.mockResolvedValue({
      status,
      invitationStatus: "SUSPENDED",
      invitationEmail: "a@example.com",
      sessionEmail: "b@example.com",
    });

    const response = await invitationPOST(
      postRequest(INVITATION_PATH, { token: "tkn" })
    );

    expect(response.status).toBe(expected);
  });

});

describe("invitation accept POST outcomes", () => {
  it("passes the authenticated session to the service", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: true,
      session: { userId: "usr_1", email: INVITEE_EMAIL, userName: "Invitee" },
    });
    invitationMocks.acceptInvitation.mockResolvedValue(ACCEPTED);

    const response = await invitationPOST(
      postRequest(INVITATION_PATH, { token: "tkn" })
    );

    expect(response.status).toBe(200);
    expect(invitationMocks.acceptInvitation).toHaveBeenCalledWith({
      token: "tkn",
      password: undefined,
      name: undefined,
      session: { userId: "usr_1", email: INVITEE_EMAIL, userName: "Invitee" },
    });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
  });

  it("accepts with a password for anonymous visitors", async () => {
    invitationMocks.acceptInvitation.mockResolvedValue(ACCEPTED);

    const response = await invitationPOST(
      postRequest(INVITATION_PATH, {
        token: "tkn",
        password: "SecurePassword123!",
        name: "Invitee",
      })
    );

    expect(response.status).toBe(200);
    expect(invitationMocks.acceptInvitation).toHaveBeenCalledWith({
      token: "tkn",
      password: "SecurePassword123!",
      name: "Invitee",
      session: null,
    });
  });

  it("maps a quota failure to 409", async () => {
    invitationMocks.acceptInvitation.mockRejectedValue(
      new QuotaExceededError({
        resourceKey: "members",
        resourceLabel: "Members",
        limitValue: "5",
        currentValue: "5",
        unit: "count",
      })
    );

    const response = await invitationPOST(
      postRequest(INVITATION_PATH, { token: "tkn" })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("returns 500 when acceptance throws", async () => {
    invitationMocks.acceptInvitation.mockRejectedValue(new Error("boom"));

    const response = await invitationPOST(
      postRequest(INVITATION_PATH, { token: "tkn" })
    );

    expect(response.status).toBe(500);
  });
});
