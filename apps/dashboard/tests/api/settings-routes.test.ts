import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@suite/core";
import { GET, PATCH } from "../../src/app/api/v1/settings/organization/route";
import { POST as installPOST } from "../../src/app/api/v1/apps/[id]/install/route";

const authMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
}));
const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const settingsMocks = vi.hoisted(() => ({
  getOrganizationDetail: vi.fn(),
  getOrganizationStatus: vi.fn(),
  isCustomDomainClaimed: vi.fn(),
  updateOrganizationRecord: vi.fn(),
}));
const appsMocks = vi.hoisted(() => ({ installApplication: vi.fn() }));

vi.mock("@suite/auth", () => ({
  signSessionToken: authMocks.signSessionToken,
  encodeSessionPayload: authMocks.encodeSessionPayload,
  createSessionCookieOptions: authMocks.createSessionCookieOptions,
}));
vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/services/organization-settings.service", () => settingsMocks);
vi.mock("@/services/installed-apps.service", () => ({
  installApplication: appsMocks.installApplication,
}));

const SETTINGS_PATH = "/api/v1/settings/organization";

const SESSION = {
  userId: "usr_1",
  email: "owner@example.com",
  organizationId: "org_1",
  organizationName: "Acme",
  permissions: [PERMISSIONS.CORE.ORGANIZATION_READ, PERMISSIONS.CORE.ORGANIZATION_UPDATE],
};

const ORGANIZATION = { id: "org_1", name: "Acme", status: "ACTIVE" };

function getRequest(url: string): NextRequest {
  return new NextRequest("https://app.example.com" + url);
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/v1/settings/organization", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: true, session: SESSION });
  settingsMocks.getOrganizationDetail.mockResolvedValue(ORGANIZATION);
  settingsMocks.getOrganizationStatus.mockResolvedValue({ status: "ACTIVE" });
  settingsMocks.isCustomDomainClaimed.mockResolvedValue(false);
  settingsMocks.updateOrganizationRecord.mockResolvedValue(ORGANIZATION);
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
});

describe("organization settings GET", () => {
  it("returns the authenticated-session problem when unauthenticated", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 401 }),
    });

    const response = await GET(getRequest(SETTINGS_PATH));

    expect(response.status).toBe(401);
  });

  it("denies the read without the organization-read capability", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: true,
      session: { ...SESSION, permissions: [] },
    });

    const response = await GET(getRequest(SETTINGS_PATH));

    expect(response.status).toBe(403);
    expect(settingsMocks.getOrganizationDetail).not.toHaveBeenCalled();
  });

  it("returns 404 when the organization is missing", async () => {
    settingsMocks.getOrganizationDetail.mockResolvedValue(null);

    const response = await GET(getRequest(SETTINGS_PATH));

    expect(response.status).toBe(404);
  });

  it("returns 403 for an archived organization", async () => {
    settingsMocks.getOrganizationDetail.mockResolvedValue({ ...ORGANIZATION, status: "ARCHIVED" });

    const response = await GET(getRequest(SETTINGS_PATH));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ORGANIZATION_ARCHIVED" });
  });

  it("returns the organization detail", async () => {
    const response = await GET(getRequest(SETTINGS_PATH));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "org_1" });
  });

  it("returns 500 when the read throws", async () => {
    settingsMocks.getOrganizationDetail.mockRejectedValue(new Error("boom"));

    const response = await GET(getRequest(SETTINGS_PATH));

    expect(response.status).toBe(500);
  });
});

describe("organization settings PATCH", () => {
  it("denies the update without the organization-update capability", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: true,
      session: { ...SESSION, permissions: [PERMISSIONS.CORE.ORGANIZATION_READ] },
    });

    const response = await PATCH(patchRequest({ name: "New Name" }));

    expect(response.status).toBe(403);
  });

  it("refuses to modify an archived organization", async () => {
    settingsMocks.getOrganizationStatus.mockResolvedValue({ status: "ARCHIVED" });

    const response = await PATCH(patchRequest({ name: "New Name" }));

    expect(response.status).toBe(403);
  });

  it("refuses to modify a missing organization", async () => {
    settingsMocks.getOrganizationStatus.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ name: "New Name" }));

    expect(response.status).toBe(403);
  });

  it("rejects malformed JSON", async () => {
    const response = await PATCH(patchRequest("{bad-json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_JSON" });
  });

  it("rejects an invalid field", async () => {
    const response = await PATCH(patchRequest({ currency: "IN" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a claimed custom domain", async () => {
    settingsMocks.isCustomDomainClaimed.mockResolvedValue(true);

    const response = await PATCH(patchRequest({ customDomain: "acme.example.com" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DOMAIN_ALREADY_EXISTS" });
  });

});

describe("organization settings PATCH session handling", () => {
  it("refreshes the session cookie when the organization is renamed", async () => {
    const response = await PATCH(patchRequest({ name: "Acme Two" }));

    expect(response.status).toBe(200);
    expect(settingsMocks.updateOrganizationRecord).toHaveBeenCalledWith("org_1", {
      name: "Acme Two",
    });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
  });

  it("clears the session cookie when the organization is archived", async () => {
    settingsMocks.updateOrganizationRecord.mockResolvedValue({
      ...ORGANIZATION,
      status: "ARCHIVED",
    });

    const response = await PATCH(patchRequest({ status: "ARCHIVED" }));

    expect(response.status).toBe(200);
    expect(response.cookies.get("bos_session")?.value ?? "").toBe("");
  });

  it("leaves the cookie alone when the name is unchanged", async () => {
    const response = await PATCH(patchRequest({ currency: "USD" }));

    expect(response.status).toBe(200);
    expect(authMocks.signSessionToken).not.toHaveBeenCalled();
  });

  it("returns 500 when the update throws", async () => {
    settingsMocks.updateOrganizationRecord.mockRejectedValue(new Error("boom"));

    const response = await PATCH(patchRequest({ name: "Acme Two" }));

    expect(response.status).toBe(500);
  });
});

function installRequest(id: string): NextRequest {
  return new NextRequest("https://app.example.com/api/v1/apps/" + id + "/install", {
    method: "POST",
  });
}

describe("app install route", () => {
  it("returns the session problem when unauthenticated", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 401 }),
    });

    const response = await installPOST(installRequest("cms"), {
      params: Promise.resolve({ id: "cms" }),
    });

    expect(response.status).toBe(401);
  });

  it("requires an application identifier", async () => {
    const response = await installPOST(installRequest("cms"), {
      params: Promise.resolve({ id: "" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "APP_ID_REQUIRED" });
  });

});

describe("app install gate outcomes", () => {
  it("requires a verified email", async () => {
    appsMocks.installApplication.mockResolvedValue({ status: "email_unverified" });

    const response = await installPOST(installRequest("cms"), {
      params: Promise.resolve({ id: "cms" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
  });

  it("requires the install capability", async () => {
    appsMocks.installApplication.mockResolvedValue({ status: "forbidden" });

    const response = await installPOST(installRequest("cms"), {
      params: Promise.resolve({ id: "cms" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_PERMISSIONS" });
  });

  it("installs the application for the session organization", async () => {
    appsMocks.installApplication.mockResolvedValue({
      status: "installed",
      appId: "cms",
      installedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await installPOST(installRequest("cms"), {
      params: Promise.resolve({ id: "cms" }),
    });

    expect(response.status).toBe(200);
    expect(appsMocks.installApplication).toHaveBeenCalledWith({
      organizationId: "org_1",
      appId: "cms",
      userId: "usr_1",
      sessionPermissions: SESSION.permissions,
    });
  });

  it("defaults missing session permissions to an empty list", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: true,
      session: { ...SESSION, permissions: undefined },
    });
    appsMocks.installApplication.mockResolvedValue({ status: "forbidden" });

    await installPOST(installRequest("cms"), { params: Promise.resolve({ id: "cms" }) });

    expect(appsMocks.installApplication).toHaveBeenCalledWith(
      expect.objectContaining({ sessionPermissions: [] })
    );
  });

  it("returns 500 when the install throws", async () => {
    appsMocks.installApplication.mockRejectedValue(new Error("boom"));

    const response = await installPOST(installRequest("cms"), {
      params: Promise.resolve({ id: "cms" }),
    });

    expect(response.status).toBe(500);
  });
});
