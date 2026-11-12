import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import LoginPage from "../src/app/(auth)/login/page";
import SiteOnboardingWizard from "../src/app/(dashboard)/sites/onboarding/page";
import OverviewPage from "../src/app/(dashboard)/dashboard/page";
import SitePreviewPage from "../src/app/(editor)/sites/[siteId]/preview/[pageId]/page";
import {
  CreatePageSchema,
  PageExplorerTable,
} from "../src/components/sites";
import {
  GlobeIcon,
  ShoppingCartIcon,
  BuildingIcon,
  PackageIcon,
} from "@suite/ui/icons";

vi.mock("next/navigation", () => ({
  useParams: () => ({
    siteId: "site_riverview_main",
    pageId: "page_home_01",
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => "/sites",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Automated E2E Integration Suite: Complete Authoring Lifecycle (@suite/dashboard)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Lifecycle Step 0: Platform Auth Gate & Tenant Login", () => {
    it("renders enterprise login credentials form and signup navigation", () => {
      const html = renderToString(<LoginPage />);

      expect(html).toContain("Business OS");
      expect(html).toContain("Sign In to Workspace");
      expect(html).toContain("operator@company.com");
      expect(html).toContain("Sign up");
    });
  });

  describe("Lifecycle Step 1: Executive Launcher & Tenant Overview", () => {
    it("renders executive app launcher with all installed business applications", () => {
      const html = renderToString(
        <OverviewPage
          initialApps={[
            {
              title: "Website Builder & Headless CMS",
              code: "App 01",
              desc: "Visual canvas studio and storefront delivery.",
              href: "/sites",
              icon: GlobeIcon,
              status: "Available",
              isAvailable: true,
            },
            {
              title: "Lodging Property Management (PMS)",
              code: "App 03",
              desc: "Multi-property reservation calendar.",
              href: "/pms",
              icon: BuildingIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
            {
              title: "Restaurant POS & KDS",
              code: "App 04",
              desc: "Touch ordering and shift reconciliation.",
              href: "/pos",
              icon: ShoppingCartIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
            {
              title: "Central Inventory & Stock Requisitions",
              code: "App 05",
              desc: "Multi-warehouse stock balances.",
              href: "/inventory",
              icon: PackageIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
          ]}
        />
      );

      expect(html).toContain("Executive App Launcher");
      expect(html).toContain("Website Builder &amp; Headless CMS");
      expect(html).toContain("Restaurant POS &amp; KDS");
      expect(html).toContain("Lodging Property Management (PMS)");
      expect(html).toContain("Central Inventory &amp; Stock Requisitions");
      expect(html).toContain("href=\"/sites\"");
    });
  });

  describe("Lifecycle Step 2: One Create-Site Surface", () => {
    it("renders the config-driven wizard linked from the websites hub", () => {
      vi.stubEnv("DOMAIN_ROOT", "localhost");
      const html = renderToString(<SiteOnboardingWizard />);

      expect(html).toContain("Create a website");
      expect(html).toContain("Name the site");
      expect(html).toContain("Create site and open studio");
    });
  });

  describe("Lifecycle Step 3: Page Explorer & Revision Tracking", () => {
    it("renders page explorer with URL hierarchy, CAS revisions, and Studio links", () => {
      // The pages screen now redirects into the studio; the table shell is
      // still covered directly with its API-shaped data.
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
      expect(tableHtml).toContain("href=\"/dashboard/sites/site_riverview_main/studio/page_home_01\"");
      expect(tableHtml).toContain("href=\"/dashboard/sites/site_riverview_main/preview/page_home_01\"");
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

  describe("Lifecycle Step 6: Live Guest Storefront Preview Sandbox", () => {
    it("renders unencumbered guest storefront preview with device simulation frames", () => {
      const html = renderToString(<SitePreviewPage />);

      // Top Preview Header & Mode Switching
      expect(html).toContain("Exit Preview");
      expect(html).toContain("Live Preview");
      expect(html).toContain("Edit in Studio");
      expect(html).toContain("href=\"/dashboard/sites/site_riverview_main/studio/page_home_01\"");

      // Device Controls
      expect(html).toContain("Desktop");
      expect(html).toContain("Tablet");
      expect(html).toContain("Mobile");
      expect(html).toContain("Fluid");

      // Empty State Preview
      expect(html).toContain("No page content to preview");

      // Cleanliness Check: Zero editor artifacts in guest preview
      expect(html).not.toContain("Page Layers");
      expect(html).not.toContain("Block inspector for");
    });
  });

});
