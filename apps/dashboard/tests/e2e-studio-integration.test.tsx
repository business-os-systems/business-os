import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import OverviewPage from "../src/app/(dashboard)/page";
import SitesPage from "../src/app/(dashboard)/sites/page";
import SitePagesPage from "../src/app/(dashboard)/sites/[siteId]/pages/page";
import StudioEditorPage from "../src/app/(editor)/sites/[siteId]/editor/[pageId]/page";
import SitePreviewPage from "../src/app/(editor)/sites/[siteId]/preview/[pageId]/page";
import { CmsApiClient } from "../src/lib/api/cms-client";
import { CreateSiteSchema, CreatePageSchema } from "../src/components/sites";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    siteId: "site_riverview_main",
    pageId: "page_home_01",
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => "/sites",
}));

describe("Automated E2E Integration Suite: Complete Authoring Lifecycle (@suite/dashboard)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Lifecycle Step 1: Executive Launcher & Tenant Overview", () => {
    it("renders executive app launcher with all installed business applications", () => {
      const html = renderToString(<OverviewPage />);

      expect(html).toContain("Executive App Launcher");
      expect(html).toContain("Website Builder &amp; Headless CMS");
      expect(html).toContain("Restaurant POS &amp; KDS");
      expect(html).toContain("Lodging Property Management (PMS)");
      expect(html).toContain("Central Inventory &amp; Stock Requisitions");
      expect(html).toContain("href=\"/sites\"");
    });
  });

  describe("Lifecycle Step 2: Website Builder Sites Listing & Domain Discovery", () => {
    it("renders sites listing page with domain routes and new website trigger", () => {
      const html = renderToString(<SitesPage />);

      expect(html).toContain("Websites &amp; Storefronts");
      expect(html).toContain("Riverview Bistro Flagship");
      expect(html).toContain("riverview-bistro.business-os.site");
      expect(html).toContain("riverviewbistro.com");
      expect(html).toContain("Cafe Terrace &amp; Wine Bar");
      expect(html).toContain("New Website");
      expect(html).toContain("href=\"/sites/site_riverview_main/pages\"");
    });

    it("enforces strict Zod validation on new site creation inputs", () => {
      const valid = CreateSiteSchema.safeParse({
        name: "New Rooftop Bar",
        subdomain: "rooftop-bar",
        customDomain: "rooftop.com",
      });
      expect(valid.success).toBe(true);

      const invalidSubdomain = CreateSiteSchema.safeParse({
        name: "New Rooftop Bar",
        subdomain: "Rooftop Bar!!",
      });
      expect(invalidSubdomain.success).toBe(false);
    });
  });

  describe("Lifecycle Step 3: Page Explorer & Revision Tracking", () => {
    it("renders page explorer with URL hierarchy, CAS revisions, and Studio links", () => {
      const html = renderToString(<SitePagesPage />);

      expect(html).toContain("Site Pages");
      expect(html).toContain("Homepage &amp; Welcome Hero");
      expect(html).toContain("/index");
      expect(html).toContain("Home");
      expect(html).toContain("v4");
      expect(html).toContain("Summer Tasting Menu");
      expect(html).toContain("/menu");
      expect(html).toContain("v2");
      expect(html).toContain("New Page");
      expect(html).toContain("Edit in Studio");
      expect(html).toContain("Preview");
      expect(html).toContain("href=\"/sites/site_riverview_main/editor/page_home_01\"");
      expect(html).toContain("href=\"/sites/site_riverview_main/preview/page_home_01\"");
    });

    it("enforces strict Zod validation on new page creation inputs", () => {
      const valid = CreatePageSchema.safeParse({
        name: "Valentine's Tasting Menu",
        slug: "valentines-menu",
        isHome: false,
      });
      expect(valid.success).toBe(true);

      const invalidSlug = CreatePageSchema.safeParse({
        name: "Valentine's Tasting Menu",
        slug: "invalid slug with spaces!",
      });
      expect(invalidSlug.success).toBe(false);
    });
  });

  describe("Lifecycle Step 4: Visual Authoring Studio Mounting & Inspection", () => {
    it("mounts full-screen studio cockpit with layers, canvas, and property inspector", () => {
      const html = renderToString(<StudioEditorPage />);

      // Cockpit Header
      expect(html).toContain("Exit Studio");
      expect(html).toContain("site_riverview_main");
      expect(html).toContain("CAS Revision: v4");
      expect(html).toContain("Ready");

      // Left Layers Drawer
      expect(html).toContain("Page Layers");
      expect(html).toContain("Hero Showcase");
      expect(html).toContain("Core Highlights");
      expect(html).toContain("Tasting Menus");

      // Center Visual Canvas
      expect(html).toContain("data-canvas-workspace=\"true\"");
      expect(html).toContain("Artisanal Dining by the Waterfront");
      expect(html).toContain("The Culinary Experience");
      expect(html).toContain("Chef&#x27;s Tasting Menus");

      // Right Property Inspector
      expect(html).toContain("Block inspector for hero");
      expect(html).toContain("b_hero_1");
    });
  });

  describe("Lifecycle Step 5: CAS Optimistic Concurrency Control Gateway", () => {
    it("dispatches draft content updates with expectedRevision header to backend gateway", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          success: true,
          pageId: "page_home_01",
          revision: 5,
          draftAst: { verified: true },
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://gateway.test", enableOfflineFallback: false });
      const result = await client.updateDraftContent({
        organizationId: "org_riverside",
        pageId: "page_home_01",
        expectedRevision: 4,
        draftAst: { verified: true },
      });

      expect(result.success).toBe(true);
      expect(result.revision).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://gateway.test/api/v1/cms/admin/pages/page_home_01/content",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            "x-tenant-id": "org_riverside",
          }),
        })
      );
    });

    it("safeguards document consistency against concurrent edits via HTTP 409 OCC", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          type: "https://errors.business-os.com/cms/concurrency-conflict",
          title: "Revision Conflict",
          status: 409,
          detail: "Page was modified by another user.",
          activeRevision: 9,
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://gateway.test", enableOfflineFallback: false });
      const result = await client.updateDraftContent({
        organizationId: "org_riverside",
        pageId: "page_home_01",
        expectedRevision: 4,
        draftAst: {},
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("CMS_CONCURRENCY_CONFLICT");
      expect(result.revision).toBe(9);
    });
  });

  describe("Lifecycle Step 6: Live Guest Storefront Preview Sandbox", () => {
    it("renders unencumbered guest storefront preview with device simulation frames", () => {
      const html = renderToString(<SitePreviewPage />);

      // Top Preview Header & Mode Switching
      expect(html).toContain("Exit Preview");
      expect(html).toContain("Live Preview");
      expect(html).toContain("Edit in Studio");
      expect(html).toContain("href=\"/sites/site_riverview_main/editor/page_home_01\"");

      // Device Controls
      expect(html).toContain("Desktop");
      expect(html).toContain("Tablet");
      expect(html).toContain("Mobile");
      expect(html).toContain("Fluid");

      // Sandbox AST Rendering Parity
      expect(html).toContain("data-cms-page=\"true\"");
      expect(html).toContain("Artisanal Dining by the Waterfront");
      expect(html).toContain("The Culinary Experience");
      expect(html).toContain("Chef&#x27;s Tasting Menus");

      // Cleanliness Check: Zero editor artifacts in guest preview
      expect(html).not.toContain("Page Layers");
      expect(html).not.toContain("Block inspector for");
    });
  });
});
