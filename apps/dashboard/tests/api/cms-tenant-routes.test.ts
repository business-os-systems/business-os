import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as templatesGET } from "../../src/app/api/cms/templates/route";
import { GET as subdomainGET } from "../../src/app/api/cms/subdomain/check/route";
import { POST as switchTenantPOST } from "../../src/app/api/v1/auth/switch-tenant/route";

const authMocks = vi.hoisted(() => ({
  signSessionToken: vi.fn(),
  encodeSessionPayload: vi.fn(),
  createSessionCookieOptions: vi.fn(),
}));
const cmsMocks = vi.hoisted(() => ({
  listStarterTemplates: vi.fn(),
  checkSubdomainAvailability: vi.fn(),
  enforceSubdomainCheckRateLimit: vi.fn(),
}));
const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const tenantMocks = vi.hoisted(() => ({ switchTenantSession: vi.fn() }));

vi.mock("@suite/auth", () => ({
  SESSION_COOKIE_NAME: "bos_session",
  ForbiddenError: class ForbiddenError extends Error {},
  signSessionToken: authMocks.signSessionToken,
  encodeSessionPayload: authMocks.encodeSessionPayload,
  createSessionCookieOptions: authMocks.createSessionCookieOptions,
}));
vi.mock("@/services/cms-templates.service", () => ({
  listStarterTemplates: cmsMocks.listStarterTemplates,
}));
vi.mock("@/services/cms-subdomain.service", () => ({
  checkSubdomainAvailability: cmsMocks.checkSubdomainAvailability,
  enforceSubdomainCheckRateLimit: cmsMocks.enforceSubdomainCheckRateLimit,
}));
vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/services/session-context.service", () => ({
  switchTenantSession: tenantMocks.switchTenantSession,
}));

const SWITCH_TENANT_PATH = "/api/v1/auth/switch-tenant";

const SESSION = {
  userId: "usr_1",
  email: "user@example.com",
  userName: "User",
  permissions: ["branches:read"],
  themePreference: "system",
};

const TENANT_CONTEXT = {
  organizationId: "org_2",
  organizationName: "Second",
  activeBranchId: "br_1",
  activeBranchName: "HQ",
  role: "member",
  roleSlug: "member",
  permissions: ["branches:read"],
};

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest("https://app.example.com" + url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: true, session: SESSION });
  cmsMocks.enforceSubdomainCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe("starter templates route", () => {
  it("returns the starter templates", async () => {
    cmsMocks.listStarterTemplates.mockResolvedValue([{ id: "tpl_1", title: "Starter" }]);

    const response = await templatesGET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ templates: [{ id: "tpl_1" }] });
  });

  it("returns 500 when the query throws", async () => {
    cmsMocks.listStarterTemplates.mockRejectedValue(new Error("boom"));

    const response = await templatesGET();

    expect(response.status).toBe(500);
  });
});

describe("subdomain availability route", () => {
  it("rate-limits the caller", async () => {
    cmsMocks.enforceSubdomainCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });

    const response = await subdomainGET(
      request("/api/cms/subdomain/check?subdomain=acme", undefined)
    );

    expect(response.status).toBe(429);
    expect(cmsMocks.checkSubdomainAvailability).not.toHaveBeenCalled();
  });

  it("rejects a too-short subdomain", async () => {
    const response = await subdomainGET(request("/api/cms/subdomain/check?subdomain=a"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_SUBDOMAIN" });
  });

  it("rejects a missing subdomain", async () => {
    const response = await subdomainGET(request("/api/cms/subdomain/check"));

    expect(response.status).toBe(400);
  });

  it("reports availability", async () => {
    cmsMocks.checkSubdomainAvailability.mockResolvedValue({ available: true });

    const response = await subdomainGET(request("/api/cms/subdomain/check?subdomain=acme"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: true });
  });

  it("returns 500 when the check throws", async () => {
    cmsMocks.checkSubdomainAvailability.mockRejectedValue(new Error("boom"));

    const response = await subdomainGET(request("/api/cms/subdomain/check?subdomain=acme"));

    expect(response.status).toBe(500);
  });
});

describe("switch-tenant route", () => {
  it("returns the session problem when unauthenticated", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 401 }),
    });

    const response = await switchTenantPOST(request(SWITCH_TENANT_PATH, { organizationId: "org_2" }));

    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload", async () => {
    const response = await switchTenantPOST(request(SWITCH_TENANT_PATH, {}));

    expect(response.status).toBe(400);
    expect(tenantMocks.switchTenantSession).not.toHaveBeenCalled();
  });

  it("treats an unparseable body as a null payload", async () => {
    const response = await switchTenantPOST(
      new NextRequest("https://app.example.com/api/v1/auth/switch-tenant", {
        method: "POST",
        body: "{bad",
      })
    );

    expect(response.status).toBe(400);
  });

  it("switches the workspace and refreshes the session", async () => {
    tenantMocks.switchTenantSession.mockResolvedValue(TENANT_CONTEXT);

    const response = await switchTenantPOST(
      request(SWITCH_TENANT_PATH, { organizationId: "org_2" })
    );

    expect(response.status).toBe(200);
    expect(tenantMocks.switchTenantSession).toHaveBeenCalledWith({
      userId: "usr_1",
      organizationId: "org_2",
    });
    expect(response.cookies.get("bos_session")?.value).toBe("signed-token");
  });

});

describe("switch-tenant route failures", () => {
  it("maps a forbidden error to a 403 problem", async () => {
    tenantMocks.switchTenantSession.mockRejectedValue(
      Object.assign(new Error("no access"), { statusCode: 403 })
    );

    const response = await switchTenantPOST(
      request(SWITCH_TENANT_PATH, { organizationId: "org_2" })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ detail: "no access" });
  });

  it("maps an unknown error to a 500 problem", async () => {
    tenantMocks.switchTenantSession.mockRejectedValue(new Error("boom"));

    const response = await switchTenantPOST(
      request(SWITCH_TENANT_PATH, { organizationId: "org_2" })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("treats a non-object rejection as a non-forbidden error", async () => {
    tenantMocks.switchTenantSession.mockRejectedValue("boom");

    const response = await switchTenantPOST(
      request(SWITCH_TENANT_PATH, { organizationId: "org_2" })
    );

    expect(response.status).toBe(500);
  });
});
