import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@suite/core";

const mocks = vi.hoisted(() => ({
  getAuthenticatedSession: vi.fn(),
  evaluateAccess: vi.fn(),
  listWebsiteSites: vi.fn(),
  createSite: vi.fn(),
}));

vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: mocks.getAuthenticatedSession,
}));
vi.mock("@/lib/website-builder-access", () => ({
  evaluateWebsiteBuilderAccess: mocks.evaluateAccess,
}));
vi.mock("@/services/websites.service", () => ({
  listWebsiteSites: mocks.listWebsiteSites,
}));
vi.mock("@suite/website-builder/services", () => ({
  SiteService: vi.fn(() => ({ createSite: mocks.createSite })),
}));

import { GET, POST } from "@/app/api/cms/sites/route";

const SITES_PATH = "/api/cms/sites";
const SESSION = {
  userId: "usr_sites_1",
  organizationId: "org_session",
  permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
};

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://tenant.example.com${path}`, { headers });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isJsonObject(body)) {
    throw new Error("expected a JSON object response");
  }
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedSession.mockResolvedValue({ ok: true, session: SESSION });
  mocks.evaluateAccess.mockResolvedValue({
    kind: "granted",
    permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
  });
  mocks.listWebsiteSites.mockResolvedValue({
    kind: "ok",
    page: { sites: [], nextCursor: null },
  });
});

describe("GET /api/cms/sites authorization", () => {
  it("passes through the session problem when unauthenticated", async () => {
    mocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    });

    const response = await GET(request(SITES_PATH));

    expect(response.status).toBe(401);
    expect(mocks.evaluateAccess).not.toHaveBeenCalled();
  });

  it("denies a tenant without the Website Builder installation", async () => {
    mocks.evaluateAccess.mockResolvedValue({
      kind: "denied",
      reason: "app_not_installed",
    });

    const response = await GET(request(SITES_PATH));
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.code).toBe("APP_NOT_INSTALLED");
    expect(body.type).toBe("/errors/app-not-installed");
    expect(mocks.listWebsiteSites).not.toHaveBeenCalled();
  });

  it("denies a member without cms:sites:read", async () => {
    mocks.evaluateAccess.mockResolvedValue({
      kind: "denied",
      reason: "capability_denied",
    });

    const response = await GET(request(SITES_PATH));
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.code).toBe("CAPABILITY_DENIED");
    expect(mocks.listWebsiteSites).not.toHaveBeenCalled();
  });

  it("fails closed when entitlements cannot be verified", async () => {
    mocks.evaluateAccess.mockResolvedValue({
      kind: "denied",
      reason: "entitlements_unavailable",
    });

    const response = await GET(request(SITES_PATH));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(mocks.listWebsiteSites).not.toHaveBeenCalled();
  });
});

describe("GET /api/cms/sites tenant identity", () => {
  it("uses the session organization and never the x-tenant-id header", async () => {
    const response = await GET(
      request(SITES_PATH, { "x-tenant-id": "org_attacker" })
    );

    expect(response.status).toBe(200);
    expect(mocks.listWebsiteSites).toHaveBeenCalledWith({
      organizationId: "org_session",
      cursor: undefined,
      limit: 25,
    });
  });

  it("returns the cursor page from the tenant-scoped service", async () => {
    mocks.listWebsiteSites.mockResolvedValue({
      kind: "ok",
      page: {
        sites: [
          {
            id: "site_1",
            title: "Riverview",
            slug: "riverview",
            status: "DRAFT",
            timezone: "UTC",
            primaryDomain: null,
            pageCount: 1,
            homePageId: "page_1",
            updatedAt: "2026-11-11T00:00:00.000Z",
          },
        ],
        nextCursor: "cursor_2",
      },
    });

    const response = await GET(request(`${SITES_PATH}?limit=10&cursor=cursor_1`));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.sites).toHaveLength(1);
    expect(body.nextCursor).toBe("cursor_2");
    expect(mocks.listWebsiteSites).toHaveBeenCalledWith({
      organizationId: "org_session",
      cursor: "cursor_1",
      limit: 10,
    });
  });
});

describe("POST /api/cms/sites authorization", () => {
  const VALID_BODY = {
    title: "Riverview Bistro",
    slug: "riverview-bistro",
    initialTemplate: "hero_starter",
  };

  function postRequest(body: unknown): NextRequest {
    return new NextRequest("https://tenant.example.com/api/cms/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("denies a member without cms:sites:write", async () => {
    mocks.evaluateAccess.mockResolvedValue({
      kind: "denied",
      reason: "capability_denied",
    });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(403);
    expect(mocks.createSite).not.toHaveBeenCalled();
  });

  it("denies a tenant without the installation", async () => {
    mocks.evaluateAccess.mockResolvedValue({
      kind: "denied",
      reason: "app_not_installed",
    });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(403);
    expect(mocks.createSite).not.toHaveBeenCalled();
  });

  it("creates from the session organization only", async () => {
    mocks.createSite.mockResolvedValue({
      site: { id: "site_new", title: "Riverview Bistro", slug: "riverview-bistro", status: "DRAFT" },
      homePage: { id: "page_new", title: "Home", slug: "/" },
    });

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(mocks.evaluateAccess).toHaveBeenCalledWith({
      actor: SESSION,
      capability: PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
    });
    expect(mocks.createSite).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_session" })
    );
  });
});

describe("GET /api/cms/sites validation and failures", () => {
  it("rejects an out-of-range page size before reading", async () => {
    const response = await GET(request(`${SITES_PATH}?limit=999`));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(mocks.listWebsiteSites).not.toHaveBeenCalled();
  });

  it("rejects a malformed cursor", async () => {
    mocks.listWebsiteSites.mockResolvedValue({ kind: "invalid_cursor" });

    const response = await GET(request(`${SITES_PATH}?cursor=not-a-cursor`));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("maps an unexpected read failure to a generic problem without leaking it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listWebsiteSites.mockRejectedValue(new Error("database password leaked"));

    const response = await GET(request(SITES_PATH));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(String(body.detail)).not.toContain("password");
    consoleError.mockRestore();
  });
});
