import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@suite/core";

const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const accessMocks = vi.hoisted(() => ({ evaluateWebsiteBuilderAccess: vi.fn() }));
const pageMocks = vi.hoisted(() => ({
  getPage: vi.fn(),
  updateDraftContent: vi.fn(),
  listPages: vi.fn(),
  createPage: vi.fn(),
  listPageVersions: vi.fn(),
}));
const appsMocks = vi.hoisted(() => ({ listInstalledApps: vi.fn() }));
const siteMocks = vi.hoisted(() => ({ provisionSiteFromTemplate: vi.fn() }));

vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/lib/website-builder-access", () => ({
  evaluateWebsiteBuilderAccess: accessMocks.evaluateWebsiteBuilderAccess,
}));
vi.mock("@suite/website-builder/services", () => ({
  PageService: vi.fn(() => pageMocks),
  provisionSiteFromTemplate: siteMocks.provisionSiteFromTemplate,
  SITE_IDEMPOTENCY_KEY_PATTERN: /^[A-Za-z0-9._:-]{8,128}$/,
}));
vi.mock("@/services/installed-apps.service", () => ({
  listInstalledApps: appsMocks.listInstalledApps,
}));

import { GET as getContent, PATCH as patchContent } from "@/app/api/cms/pages/[pageId]/content/route";
import { GET as getVersions } from "@/app/api/cms/pages/[pageId]/versions/route";
import {
  GET as listSitePages,
  POST as createSitePage,
} from "@/app/api/cms/sites/[siteId]/pages/route";
import { GET as listInstalledApps } from "@/app/api/v1/installed-apps/route";
import { POST as createSite } from "@/app/api/cms/sites/route";

const SESSION = {
  userId: "usr_session_owner",
  organizationId: "org_session",
  role: "member",
  permissions: [PERMISSIONS.WEBSITE_BUILDER.PAGES_READ],
};

const VALID_PAGE_AST = {
  version: 1,
  schemaVersion: "2026-03",
  meta: { title: "Alpine Sanctuary", description: "Luxury stay in the Himalayas" },
  globalStyles: { primaryColor: "#0f172a", fontFamily: "Inter, sans-serif" },
  sections: [
    {
      id: "110e8400-e29b-41d4-a716-446655440010",
      name: "Hero Section",
      styles: { maxWidth: "xl" },
      blocks: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          type: "hero",
          props: {
            headline: "Experience Alpine Solitude",
            subheadline: "Peace, tranquility, and natural beauty.",
            primaryCta: { label: "Book Now", target: { url: "/book" } },
          },
        },
      ],
    },
  ],
};

const PAGE = {
  id: "page_1",
  title: "Home",
  slug: "/",
  revision: 3,
  status: "DRAFT",
  draftAst: VALID_PAGE_AST,
  publishedAst: null,
};

const DASHBOARD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const SOURCE_ROOT = path.join(DASHBOARD_ROOT, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(absolutePath);
    }
    return absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx")
      ? [absolutePath]
      : [];
  });
}

interface TestRequestInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

const CONTENT_PATH = "/api/cms/pages/page_1/content";
const SITE_PAGES_PATH = "/api/cms/sites/site_1/pages";
const DRAFT_BODY = { expectedRevision: 3, draftAst: VALID_PAGE_AST };

function request(url: string, init: TestRequestInit = {}): NextRequest {
  return new NextRequest("https://tenant.example.com" + url, init);
}

function draftWriteRequest(headers: Record<string, string> = {}): NextRequest {
  return request(CONTENT_PATH, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(DRAFT_BODY),
  });
}

function createPageRequest(): NextRequest {
  return request(SITE_PAGES_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "About", slug: "/about" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: true, session: SESSION });
  accessMocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
    kind: "granted",
    permissions: SESSION.permissions,
  });
  pageMocks.getPage.mockResolvedValue(PAGE);
  pageMocks.updateDraftContent.mockResolvedValue({
    success: true,
    pageId: PAGE.id,
    revision: 4,
    draftAst: VALID_PAGE_AST,
  });
  pageMocks.listPages.mockResolvedValue([PAGE]);
  pageMocks.createPage.mockResolvedValue(PAGE);
  pageMocks.listPageVersions.mockResolvedValue([]);
  appsMocks.listInstalledApps.mockResolvedValue([]);
});

describe("the duplicate tenant-header write route is gone", () => {
  const legacyTree = path.join(SOURCE_ROOT, "app", "api", "v1", "cms");

  it("leaves no route handler under /api/v1/cms", () => {
    expect(existsSync(legacyTree)).toBe(false);
  });

  it("cannot be imported, so the path can only 404", async () => {
    const legacyModule = path.join(
      legacyTree,
      "admin",
      "pages",
      "[pageId]",
      "content",
      "route.ts"
    );
    expect(existsSync(legacyModule)).toBe(false);

    const specifier = "../../src/app/api/v1/cms/admin/pages/[pageId]/content/route";
    await expect(import(/* @vite-ignore */ specifier)).rejects.toThrow();
  });
});

describe("no runtime code reads a tenant identity header", () => {
  it("only the edge middleware knows the internal tenant header names", () => {
    const offenders = sourceFiles(SOURCE_ROOT).filter((file) => {
      if (path.basename(file) === "middleware.ts") {
        return false;
      }
      const source = readFileSync(file, "utf8");
      return source.includes("x-tenant-id") || source.includes("x-organization-id");
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the shared tenant-context helper deleted", () => {
    expect(existsSync(path.join(SOURCE_ROOT, "lib", "tenant-context.ts"))).toBe(false);
  });
});

describe("a forged tenant header cannot create a site", () => {
  it("creates a site under the session organization, never the header", async () => {
    siteMocks.provisionSiteFromTemplate.mockResolvedValue({
      site: {
        id: "site_boundary",
        organizationId: "org_session",
        title: "Boundary",
        slug: "boundary",
        status: "DRAFT",
      },
      homePage: { id: "page_boundary", title: "Home", slug: "/" },
      pages: [],
      replayed: false,
    });

    const response = await createSite(
      request("/api/cms/sites", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem-boundary-1",
          "x-tenant-id": "org_attacker",
          "x-organization-id": "org_attacker",
        },
        body: JSON.stringify({
          title: "Boundary",
          slug: "boundary",
          templateId: null,
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(siteMocks.provisionSiteFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_session",
        actorUserId: "usr_session_owner",
      })
    );
  });
});

describe("a forged tenant header cannot select a workspace", () => {
  it("saves a draft under the session organization, never the header", async () => {
    const response = await patchContent(
      draftWriteRequest({
        "x-tenant-id": "org_attacker",
        "x-organization-id": "org_attacker",
      }),
      { params: Promise.resolve({ pageId: "page_1" }) }
    );

    expect(response.status).toBe(200);
    expect(pageMocks.updateDraftContent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_session", pageId: "page_1" })
    );
  });

  it("reads a page under the session organization, never the header", async () => {
    const response = await getContent(
      request(CONTENT_PATH, { headers: { "x-tenant-id": "org_attacker" } }),
      { params: Promise.resolve({ pageId: "page_1" }) }
    );

    expect(response.status).toBe(200);
    expect(pageMocks.getPage).toHaveBeenCalledWith("org_session", "page_1");
  });

  it("lists installed apps for the session organization only", async () => {
    const response = await listInstalledApps(
      request("/api/v1/installed-apps", {
        headers: { "x-tenant-id": "org_attacker", "x-organization-id": "org_attacker" },
      })
    );

    expect(response.status).toBe(200);
    expect(appsMocks.listInstalledApps).toHaveBeenCalledWith("org_session");
  });
});

describe("every CMS BFF route fails closed without a verified session", () => {
  const unauthorized = {
    ok: false,
    response: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }),
  };

  it("denies the draft write", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue(unauthorized);

    const response = await patchContent(
      draftWriteRequest(),
      { params: Promise.resolve({ pageId: "page_1" }) }
    );

    expect(response.status).toBe(401);
    expect(pageMocks.updateDraftContent).not.toHaveBeenCalled();
  });

  it("denies page creation", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue(unauthorized);

    const response = await createSitePage(createPageRequest(), {
      params: Promise.resolve({ siteId: "site_1" }),
    });

    expect(response.status).toBe(401);
    expect(pageMocks.createPage).not.toHaveBeenCalled();
  });
});

describe("every CMS BFF route enforces its capability", () => {
  beforeEach(() => {
    accessMocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
      kind: "denied",
      reason: "capability_denied",
    });
  });

  it("denies the draft write without cms:pages:write", async () => {
    const response = await patchContent(
      draftWriteRequest(),
      { params: Promise.resolve({ pageId: "page_1" }) }
    );
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("CAPABILITY_DENIED");
    expect(pageMocks.updateDraftContent).not.toHaveBeenCalled();
    expect(accessMocks.evaluateWebsiteBuilderAccess).toHaveBeenCalledWith({
      actor: SESSION,
      capability: PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE,
    });
  });

  it("denies page creation without cms:pages:write", async () => {
    const response = await createSitePage(createPageRequest(), {
      params: Promise.resolve({ siteId: "site_1" }),
    });

    expect(response.status).toBe(403);
    expect(pageMocks.createPage).not.toHaveBeenCalled();
  });

  it("denies reading page versions without cms:pages:read", async () => {
    const response = await getVersions(request("/api/cms/pages/page_1/versions"), {
      params: Promise.resolve({ pageId: "page_1" }),
    });

    expect(response.status).toBe(403);
    expect(pageMocks.listPageVersions).not.toHaveBeenCalled();
    expect(accessMocks.evaluateWebsiteBuilderAccess).toHaveBeenCalledWith({
      actor: SESSION,
      capability: PERMISSIONS.WEBSITE_BUILDER.PAGES_READ,
    });
  });

  it("denies listing a site's pages without cms:pages:read", async () => {
    const response = await listSitePages(request(SITE_PAGES_PATH), {
      params: Promise.resolve({ siteId: "site_1" }),
    });

    expect(response.status).toBe(403);
    expect(pageMocks.listPages).not.toHaveBeenCalled();
  });
});

describe("the app installation gate applies to the CMS API", () => {
  it("denies a workspace without the Website Builder installation", async () => {
    accessMocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
      kind: "denied",
      reason: "app_not_installed",
    });

    const response = await patchContent(
      draftWriteRequest(),
      { params: Promise.resolve({ pageId: "page_1" }) }
    );
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("APP_NOT_INSTALLED");
    expect(pageMocks.updateDraftContent).not.toHaveBeenCalled();
  });
});
