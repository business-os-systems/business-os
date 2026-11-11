import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "../src/middleware";
import { GET as checkSlugGet } from "../src/app/api/v1/onboarding/check-slug/route";
import { GET as checkSubdomainGet } from "../src/app/api/cms/subdomain/check/route";
import { PATCH as updateContentPatch } from "../src/app/api/cms/pages/[pageId]/content/route";
import { checkRateLimit } from "@suite/redis";
import { prisma } from "@suite/db";
import { PageService } from "@suite/website-builder/services";

vi.mock("@suite/redis", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock("@suite/db", () => {
  const mockPrisma = {
    organization: {
      findUnique: vi.fn(),
    },
    userOrganization: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const accessMocks = vi.hoisted(() => ({ evaluateWebsiteBuilderAccess: vi.fn() }));

vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));

vi.mock("@/lib/website-builder-access", () => ({
  evaluateWebsiteBuilderAccess: accessMocks.evaluateWebsiteBuilderAccess,
}));

vi.mock("@suite/website-builder/services", () => {
  const mockPageService = {
    getPage: vi.fn(),
    updateDraftContent: vi.fn(),
  };
  const mockSiteService = {
    checkSubdomainAvailability: vi.fn().mockResolvedValue({ available: true, subdomain: "test" }),
  };
  return {
    PageService: vi.fn(() => mockPageService),
    SiteService: vi.fn(() => mockSiteService),
  };
});

describe("Gateway API Boundary, Security Headers & Error Sanitization (Issue #172)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-key-that-is-at-least-32-chars-long!";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfter: 0 });
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: true,
      session: { userId: "usr_1", organizationId: "org_test_tenant" },
    });
    accessMocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
      kind: "granted",
      permissions: ["cms:pages:write"],
    });
  });

  describe("Security Headers Injection (Issue 29)", () => {
    it("injects mandatory security headers into bypass and public responses", async () => {
      const req = new NextRequest("http://localhost:3000/login");
      const res = await middleware(req);

      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
      expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    });

    it("injects mandatory security headers into 401 unauthenticated API responses", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/protected-resource");
      const res = await middleware(req);

      expect(res.status).toBe(401);
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  describe("Slug Verification Rate Limiting & Validation (Issue 44)", () => {
    it("returns 429 when rate limit is exceeded for slug availability checks", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfter: 45,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/onboarding/check-slug?slug=my-hotel", {
        headers: { "x-forwarded-for": "203.0.113.195" },
      });

      const res = await checkSlugGet(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(res.headers.get("Retry-After")).toBe("45");
    });

    it("returns 400 when slug format is invalid", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/onboarding/check-slug?slug=INVALID_SLUG!");
      const res = await checkSlugGet(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("INVALID_SLUG");
    });

    it("returns 200 with available=true when slug does not exist", async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/onboarding/check-slug?slug=available-resort");
      const res = await checkSlugGet(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.available).toBe(true);
      expect(data.slug).toBe("available-resort");
    });
  });

  describe("Subdomain Verification Rate Limiting & Validation (Issue 44)", () => {
    it("returns 429 when rate limit is exceeded for subdomain availability checks", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfter: 30,
      });

      const req = new NextRequest("http://localhost:3000/api/cms/subdomain/check?subdomain=alpine-lodge", {
        headers: { "x-forwarded-for": "198.51.100.50" },
      });

      const res = await checkSubdomainGet(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(res.headers.get("Retry-After")).toBe("30");
    });

    it("returns 400 when subdomain query is shorter than 2 characters", async () => {
      const req = new NextRequest("http://localhost:3000/api/cms/subdomain/check?subdomain=a");
      const res = await checkSubdomainGet(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("INVALID_SUBDOMAIN");
    });
  });

  describe("CMS Page Content AST Schema Boundary & Concurrency (Issue 40 & 45)", () => {
    it("returns 401 when the request carries no verified session", async () => {
      sessionMocks.getAuthenticatedSession.mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          {
            type: "/errors/unauthorized",
            title: "Unauthorized",
            status: 401,
            detail: "Authentication session required.",
            code: "UNAUTHORIZED",
          },
          { status: 401, headers: { "Content-Type": "application/problem+json" } }
        ),
      });

      const req = new NextRequest("http://localhost:3000/api/cms/pages/page_123/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 1,
          draftAst: { invalid: true },
        }),
      });

      const res = await updateContentPatch(req, { params: Promise.resolve({ pageId: "page_123" }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns 422 INVALID_AST_PAYLOAD when draftAst fails structural schema validation", async () => {
      const req = new NextRequest("http://localhost:3000/api/cms/pages/page_123/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 1,
          draftAst: {
            version: 1,
            // Missing schemaVersion, meta, globalStyles, and valid sections
            sections: [{ id: "bad-section", invalid: true }],
          },
        }),
      });

      const res = await updateContentPatch(req, { params: Promise.resolve({ pageId: "page_123" }) });
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.code).toBe("INVALID_AST_PAYLOAD");
      expect(data.title).toBe("Invalid Page AST Schema");
    });

    it("returns 200 when draftAst is structurally valid and revision matches", async () => {
      const validPageAst = {
        version: 1,
        schemaVersion: "2026-03",
        meta: {
          title: "Alpine Sanctuary",
          description: "Luxury stay in the Himalayas",
        },
        globalStyles: {
          primaryColor: "#0f172a",
          fontFamily: "Inter, sans-serif",
        },
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
                  primaryCta: {
                    label: "Book Now",
                    target: { url: "/book" },
                  },
                },
              },
            ],
          },
        ],
      };

      const mockPageService = new PageService();
      vi.mocked(mockPageService.updateDraftContent).mockResolvedValueOnce({
        success: true,
        pageId: "page_123",
        revision: 2,
        draftAst: validPageAst,
      });

      const req = new NextRequest("http://localhost:3000/api/cms/pages/page_123/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 1,
          draftAst: validPageAst,
        }),
      });

      const res = await updateContentPatch(req, { params: Promise.resolve({ pageId: "page_123" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.revision).toBe(2);
    });

    it("returns 409 CMS_CONCURRENCY_CONFLICT when revision does not match", async () => {
      const validPageAst = {
        version: 1,
        schemaVersion: "2026-03",
        meta: {
          title: "Alpine Sanctuary",
        },
        globalStyles: {},
        sections: [],
      };

      const mockPageService = new PageService();
      vi.mocked(mockPageService.updateDraftContent).mockResolvedValueOnce({
        success: false,
        pageId: "page_123",
        draftAst: validPageAst,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: "Revision mismatch. Expected 1 but active revision is 3.",
        revision: 3,
      });

      const req = new NextRequest("http://localhost:3000/api/cms/pages/page_123/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 1,
          draftAst: validPageAst,
        }),
      });

      const res = await updateContentPatch(req, { params: Promise.resolve({ pageId: "page_123" }) });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe("CMS_CONCURRENCY_CONFLICT");
      expect(data.activeRevision).toBe(3);
    });
  });
});
