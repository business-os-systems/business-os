import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../../src/app/api/v1/user/preferences/route";

const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const serviceMocks = vi.hoisted(() => ({ updateUserPreferences: vi.fn() }));

vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/services/user-preferences.service", () => ({
  updateUserPreferences: serviceMocks.updateUserPreferences,
}));

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/v1/user/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.getAuthenticatedSession.mockResolvedValue({
    ok: true,
    session: { userId: "usr_1" },
  });
});

describe("preferences route", () => {
  it("returns the authenticated-session problem when the session is invalid", async () => {
    const denied = new Response("denied", { status: 401 });
    sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: false, response: denied });

    const response = await PATCH(patchRequest({ theme: "dark" }));

    expect(response.status).toBe(401);
    expect(serviceMocks.updateUserPreferences).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload", async () => {
    const response = await PATCH(patchRequest({ theme: "neon" }));

    expect(response.status).toBe(400);
    expect(serviceMocks.updateUserPreferences).not.toHaveBeenCalled();
  });

  it("treats an unparseable body as an empty payload", async () => {
    serviceMocks.updateUserPreferences.mockResolvedValue({
      status: "updated",
      preferences: { theme: "system", sessionTimeoutSeconds: 86400 },
    });

    const response = await PATCH(patchRequest("{bad-json"));

    expect(response.status).toBe(200);
    expect(serviceMocks.updateUserPreferences).toHaveBeenCalledWith({
      userId: "usr_1",
      theme: undefined,
      sessionTimeoutSeconds: undefined,
    });
  });

  it("updates the preferences for the session user", async () => {
    serviceMocks.updateUserPreferences.mockResolvedValue({
      status: "updated",
      preferences: { theme: "dark", sessionTimeoutSeconds: 900 },
    });

    const response = await PATCH(patchRequest({ theme: "dark", sessionTimeoutSeconds: 900 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      preferences: { theme: "dark", sessionTimeoutSeconds: 900 },
    });
  });

  it("returns 404 when the user record is missing", async () => {
    serviceMocks.updateUserPreferences.mockResolvedValue({ status: "not_found" });

    const response = await PATCH(patchRequest({ theme: "light" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.updateUserPreferences.mockRejectedValue(new Error("boom"));

    const response = await PATCH(patchRequest({ theme: "light" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
