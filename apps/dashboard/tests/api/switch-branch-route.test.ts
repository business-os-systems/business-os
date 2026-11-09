import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
}));
const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const serviceMocks = vi.hoisted(() => ({ switchBranchSession: vi.fn() }));

vi.mock("@suite/auth", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  ForbiddenError: class ForbiddenError extends Error {},
  signSessionToken: authMocks.signSessionToken,
  encodeSessionPayload: authMocks.encodeSessionPayload,
  createSessionCookieOptions: authMocks.createSessionCookieOptions,
}));
vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/services/session-context.service", () => ({
  switchBranchSession: serviceMocks.switchBranchSession,
}));

const { POST } = await import("../../src/app/api/v1/auth/switch-branch/route");

const BRANCH_CONTEXT = {
  activeOrganizationId: "org_1",
  activeBranchId: "br_2",
  branch: { name: "Second Location" },
  permissions: ["branches:read"],
  effectiveRoles: ["manager"],
};

function switchRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://app.example.com/api/v1/auth/switch-branch", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.encodeSessionPayload.mockReturnValue("payload");
  authMocks.signSessionToken.mockResolvedValue("signed-token");
  authMocks.createSessionCookieOptions.mockReturnValue({
    name: "bos_session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  sessionMocks.getAuthenticatedSession.mockResolvedValue({
    ok: true,
    session: { userId: "usr_1", role: "member", expiresAt: Date.now() + 60_000 },
  });
  serviceMocks.switchBranchSession.mockResolvedValue(BRANCH_CONTEXT);
});

describe("switch-branch route", () => {
  it("returns the session problem when unauthenticated", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 401 }),
    });

    const response = await POST(switchRequest({ branchId: "br_2" }));

    expect(response.status).toBe(401);
    expect(serviceMocks.switchBranchSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const response = await POST(switchRequest({ branchId: "" }));

    expect(response.status).toBe(400);
    expect(serviceMocks.switchBranchSession).not.toHaveBeenCalled();
  });

  it("treats an unparseable body as a null payload", async () => {
    const response = await POST(
      new NextRequest("https://app.example.com/api/v1/auth/switch-branch", {
        method: "POST",
        body: "{bad",
      })
    );

    expect(response.status).toBe(400);
  });

  it("switches the session branch and sets the refreshed cookie", async () => {
    const response = await POST(
      switchRequest({ branchId: "br_2" }, { "x-ephemeral": "false" })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      activeBranchId: "br_2",
      activeBranchName: "Second Location",
    });
    expect(serviceMocks.switchBranchSession).toHaveBeenCalledWith({
      sessionToken: "",
      branchId: "br_2",
    });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
  });

  it("maps a forbidden error to a 403 problem", async () => {
    serviceMocks.switchBranchSession.mockRejectedValue(
      Object.assign(new Error("not your branch"), { status: 403 })
    );

    const response = await POST(switchRequest({ branchId: "br_9" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN", detail: "not your branch" });
  });

  it("maps an unknown error to a 500 problem", async () => {
    serviceMocks.switchBranchSession.mockRejectedValue("not-an-error");

    const response = await POST(switchRequest({ branchId: "br_2" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ detail: "Internal server error." });
  });

  it("treats a non-object rejection as a non-forbidden error", async () => {
    serviceMocks.switchBranchSession.mockRejectedValue(undefined);

    const response = await POST(switchRequest({ branchId: "br_2" }));

    expect(response.status).toBe(500);
  });
});
