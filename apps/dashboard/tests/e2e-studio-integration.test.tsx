import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import LoginPage from "../src/app/(auth)/login/page";
import SiteOnboardingWizard from "../src/app/(dashboard)/sites/onboarding/page";
import OverviewPage from "../src/app/(dashboard)/page";
import SitesPage from "../src/app/(dashboard)/sites/page";
import SitePagesPage from "../src/app/(dashboard)/sites/[siteId]/pages/page";
import StudioEditorPage from "../src/app/(editor)/sites/[siteId]/editor/[pageId]/page";
import SitePreviewPage from "../src/app/(editor)/sites/[siteId]/preview/[pageId]/page";
import { CmsApiClient } from "../src/lib/api/cms-client";
import {
  CreateSiteSchema,
  CreatePageSchema,
  SiteListTable,
  PageExplorerTable,
} from "../src/components/sites";

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

  describe("Lifecycle Step 0: Platform Auth Gate & Tenant Login", () => {
    it("renders enterprise login credentials form and secure TLS badge", () => {
      const html = renderToString(<LoginPage />);

      expect(html).toContain("Business OS");
      expect(html).toContain("Sign In to Workspace");
      expect(html).toContain("operator@company.com");
      expect(html).toContain("Auto-fill demo credentials");
      expect(html).toContain("TLS Encrypted");
    });
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

  describe("Lifecycle Step 2: Step-by-Step Site Onboarding Wizard", () => {
    it("renders step 1 of 4 onboarding wizard with name and subdomain inputs", () => {
      const html = renderToString(<SiteOnboardingWizard />);

      expect(html).toContain("Website Onboarding Wizard");
      expect(html).toContain("Step 1 of 4");
      expect(html).toContain("Name Your Website &amp; Subdomain");
      expect(html).toContain(".business-os.site");
      expect(html).toContain("Next: Business Goal");
    });
  });

  describe("Lifecycle Step 2: Website Builder Sites Listing & Domain Discovery", () => {
    it("renders sites listing page and table with domain routes and new website trigger", () => {
      // Test page SSR loading state
      const pageHtml = renderToString(<SitesPage />);
      expect(pageHtml).toContain("Loading websites...");

      // Test table rendering with dynamic data
      const mockSites = [
        {
          id: "site_riverview_main",
          organizationId: "org_1",
          name: "Riverview Bistro Flagship",
          subdomain: "riverview-bistro",
          customDomain: "riverviewbistro.com",
          status: "PUBLISHED" as const,
          publishedAt: "2026-10-10 12:00:00",
          pagesCount: 2,
          updatedAt: "2026-10-12 10:00:00",
        },
        {
          id: "site_cafe_terrace",
          organizationId: "org_1",
          name: "Cafe Terrace & Wine Bar",
          subdomain: "cafe-terrace",
          customDomain: null,
          status: "DRAFT" as const,
          publishedAt: null,
          pagesCount: 1,
          updatedAt: "2026-10-12 11:00:00",
        },
      ];
      const tableHtml = renderToString(
        <SiteListTable sites={mockSites} onCreateSite={() => {}} />
      );
      expect(tableHtml).toContain("Websites &amp; Storefronts");
      expect(tableHtml).toContain("Riverview Bistro Flagship");
      expect(tableHtml).toContain("riverview-bistro.business-os.site");
      expect(tableHtml).toContain("riverviewbistro.com");
      expect(tableHtml).toContain("Cafe Terrace &amp; Wine Bar");
      expect(tableHtml).toContain("New Website");
      expect(tableHtml).toContain("href=\"/sites/site_riverview_main/pages\"");
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
      // Test page SSR loading state
      const pageHtml = renderToString(<SitePagesPage />);
      expect(pageHtml).toContain("Loading pages...");

      // Test table rendering with dynamic data
      const mockPages = [
        {
          id: "page_home_01",
          siteId: "site_riverview_main",
          name: "Homepage & Welcome Hero",
          slug: "index",
          isHome: true,
          status: "PUBLISHED" as const,
          version: 4,
          updatedAt: "2026-10-12 10:00:00",
        },
        {
          id: "page_menu_02",
          siteId: "site_riverview_main",
          name: "Summer Tasting Menu",
          slug: "menu",
          isHome: false,
          status: "DRAFT" as const,
          version: 2,
          updatedAt: "2026-10-12 11:00:00",
        },
      ];
      const tableHtml = renderToString(
        <PageExplorerTable
          siteId="site_riverview_main"
          pages={mockPages}
          onCreatePage={() => {}}
        />
      );
      expect(tableHtml).toContain("Site Pages");
      expect(tableHtml).toContain("Homepage &amp; Welcome Hero");
      expect(tableHtml).toContain("/index");
      expect(tableHtml).toContain("Home");
      expect(tableHtml).toContain("v4");
      expect(tableHtml).toContain("Summer Tasting Menu");
      expect(tableHtml).toContain("/menu");
      expect(tableHtml).toContain("v2");
      expect(tableHtml).toContain("New Page");
      expect(tableHtml).toContain("Edit in Studio");
      expect(tableHtml).toContain("Preview");
      expect(tableHtml).toContain("href=\"/sites/site_riverview_main/editor/page_home_01\"");
      expect(tableHtml).toContain("href=\"/sites/site_riverview_main/preview/page_home_01\"");
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

  describe("Lifecycle Step 7: Live Page Publishing & Version Snapshots", () => {
    it("promotes draft to edge production, records immutable version snapshot, and increments revision", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          success: true,
          pageId: "page_home_01",
          revision: 5,
          versionNumber: 2,
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://gateway.test", enableOfflineFallback: false });
      const result = await client.publishPage({
        organizationId: "org_riverside",
        pageId: "page_home_01",
        expectedRevision: 4,
      });

      expect(result.success).toBe(true);
      expect(result.revision).toBe(5);
      expect(result.versionNumber).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://gateway.test/api/v1/cms/admin/pages/page_home_01/publish",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-tenant-id": "org_riverside",
          }),
        })
      );
    });

    it("fetches immutable version history snapshots for page audit trail", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          versions: [
            {
              id: "ver_2",
              organizationId: "org_riverside",
              pageId: "page_home_01",
              versionNumber: 2,
              label: "Release v2",
              astSnapshot: { live: true },
              createdAt: "2026-10-12T12:00:00Z",
            },
            {
              id: "ver_1",
              organizationId: "org_riverside",
              pageId: "page_home_01",
              versionNumber: 1,
              label: "Release v1",
              astSnapshot: { live: false },
              createdAt: "2026-10-11T12:00:00Z",
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      const client = new CmsApiClient({ baseUrl: "http://gateway.test", enableOfflineFallback: false });
      const result = await client.listPageVersions("org_riverside", "page_home_01");

      expect(result.success).toBe(true);
      expect(result.versions.length).toBe(2);
      expect(result.versions[0]?.versionNumber).toBe(2);
      expect(result.versions[1]?.versionNumber).toBe(1);
    });
  });
});
