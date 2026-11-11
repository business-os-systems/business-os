import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listTenantApps } from "../../src/app/api/v1/installed-apps/route";
import { GET as listOrganizationApps } from "../../src/app/api/v1/organizations/[orgId]/installed-apps/route";

const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const serviceMocks = vi.hoisted(() => ({ listInstalledApps: vi.fn() }));

vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/services/installed-apps.service", () => ({
  listInstalledApps: serviceMocks.listInstalledApps,
}));

const APP_ROW = {
  id: "app_row_1",
  appId: "cms",
  name: "cms",
  title: "Website Builder",
  code: "cms",
  description: "Build sites",
  href: "/sites",
  iconName: "globe",
  permission: "cms:read",
  version: "1.0.0",
  isEnabled: true,
  installedAt: "2026-01-01T00:00:00.000Z",
};

const SESSION = { userId: "usr_1", organizationId: "org_1" };

function request(path: string): NextRequest {
  return new NextRequest("https://app.example.com" + path);
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.listInstalledApps.mockResolvedValue([APP_ROW]);
  sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: true, session: SESSION });
});

describe("tenant installed-apps route", () => {
  it("returns the tenant's installed apps", async () => {
    const response = await listTenantApps(request("/api/v1/installed-apps"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      organizationId: "org_1",
      apps: [expect.objectContaining({ permission: "cms:read" })],
    });
    expect(serviceMocks.listInstalledApps).toHaveBeenCalledWith("org_1");
  });

  it("returns the session problem when no verified session resolves a tenant", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 403 }),
    });

    const response = await listTenantApps(request("/api/v1/installed-apps"));

    expect(response.status).toBe(403);
    expect(serviceMocks.listInstalledApps).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.listInstalledApps.mockRejectedValue(new Error("boom"));

    const response = await listTenantApps(request("/api/v1/installed-apps"));

    expect(response.status).toBe(500);
  });
});

describe("organization installed-apps authorization", () => {
  it("returns the session problem when unauthenticated", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 401 }),
    });

    const response = await listOrganizationApps(request("/api/v1/organizations/org_1/installed-apps"), {
      params: Promise.resolve({ orgId: "org_1" }),
    });

    expect(response.status).toBe(401);
    expect(serviceMocks.listInstalledApps).not.toHaveBeenCalled();
  });

  it("hides another organization's entitlements behind a 404", async () => {
    const response = await listOrganizationApps(request("/api/v1/organizations/org_2/installed-apps"), {
      params: Promise.resolve({ orgId: "org_2" }),
    });

    expect(response.status).toBe(404);
    expect(serviceMocks.listInstalledApps).not.toHaveBeenCalled();
  });

  it("rejects an empty organization identifier", async () => {
    const response = await listOrganizationApps(request("/api/v1/organizations//installed-apps"), {
      params: Promise.resolve({ orgId: " " }),
    });

    expect(response.status).toBe(400);
    expect(serviceMocks.listInstalledApps).not.toHaveBeenCalled();
  });
});

describe("organization installed-apps response", () => {
  it("returns the session organization's apps without the permission field", async () => {
    const response = await listOrganizationApps(request("/api/v1/organizations/org_1/installed-apps"), {
      params: Promise.resolve({ orgId: "org_1" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { apps: Record<string, unknown>[] };
    expect(body.apps[0]).not.toHaveProperty("permission");
    expect(body.apps[0]).toMatchObject({ appId: "cms" });
    expect(serviceMocks.listInstalledApps).toHaveBeenCalledWith("org_1");
  });

  it("returns 500 when the service throws", async () => {
    serviceMocks.listInstalledApps.mockRejectedValue(new Error("boom"));

    const response = await listOrganizationApps(request("/api/v1/organizations/org_1/installed-apps"), {
      params: Promise.resolve({ orgId: "org_1" }),
    });

    expect(response.status).toBe(500);
  });
});
