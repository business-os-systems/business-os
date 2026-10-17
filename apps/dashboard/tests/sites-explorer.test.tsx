import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  SiteListTable,
  PageExplorerTable,
  CreateSiteSchema,
  CreatePageSchema,
  CreateSiteDialog,
  CreatePageDialog,
  type SiteSummary,
  type PageSummary,
} from "../src/components/sites";

const MOCK_SITES: SiteSummary[] = [
  {
    id: "site_alpha",
    organizationId: "org-1",
    name: "Alpha Storefront",
    subdomain: "alpha-store",
    customDomain: "alpha.example.com",
    status: "PUBLISHED",
    publishedAt: "2026-10-10 12:00:00",
    pagesCount: 5,
    updatedAt: "2026-10-12 10:00:00",
  },
  {
    id: "site_beta",
    organizationId: "org-1",
    name: "Beta Landing",
    subdomain: "beta-landing",
    customDomain: null,
    status: "DRAFT",
    publishedAt: null,
    pagesCount: 1,
    updatedAt: "2026-10-12 11:00:00",
  },
];

const MOCK_PAGES: PageSummary[] = [
  {
    id: "page_home",
    siteId: "site_alpha",
    name: "Homepage",
    slug: "index",
    isHome: true,
    status: "PUBLISHED",
    version: 7,
    updatedAt: "2026-10-12 10:00:00",
  },
  {
    id: "page_pricing",
    siteId: "site_alpha",
    name: "Pricing Plans",
    slug: "pricing",
    isHome: false,
    status: "DRAFT",
    version: 2,
    updatedAt: "2026-10-12 11:30:00",
  },
];

describe("Website Builder Sites & Pages Explorer", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid site creation inputs", () => {
      const valid = CreateSiteSchema.safeParse({
        name: "Main Restaurant Site",
        subdomain: "main-restaurant",
        customDomain: "restaurant.com",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid subdomain format", () => {
      const invalid = CreateSiteSchema.safeParse({
        name: "Test Site",
        subdomain: "INVALID_SUBDOMAIN!",
      });
      expect(invalid.success).toBe(false);
    });

    it("validates valid page creation inputs", () => {
      const valid = CreatePageSchema.safeParse({
        name: "About Us",
        slug: "about-us",
        isHome: false,
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid page slug", () => {
      const invalid = CreatePageSchema.safeParse({
        name: "About Us",
        slug: "about us with spaces",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("SiteListTable Rendering", () => {
    it("renders sites with names, subdomains, domains, and manage buttons", () => {
      const html = renderToString(<SiteListTable sites={MOCK_SITES} />);
      expect(html).toContain("Alpha Storefront");
      expect(html).toContain("alpha-store.business-os.site");
      expect(html).toContain("alpha.example.com");
      expect(html).toContain("Beta Landing");
      expect(html).toContain("beta-landing.business-os.site");
      expect(html).toContain("href=\"/sites/site_alpha/pages\"");
      expect(html).toContain("5 pages");
    });
  });

  describe("PageExplorerTable Rendering", () => {
    it("renders page rows with status, CAS revision, and Studio routing links", () => {
      const html = renderToString(
        <PageExplorerTable siteId="site_alpha" pages={MOCK_PAGES} />
      );
      expect(html).toContain("Homepage");
      expect(html).toContain("/index");
      expect(html).toContain("Home");
      expect(html).toContain("v7");
      expect(html).toContain("Pricing Plans");
      expect(html).toContain("v2");
      expect(html).toContain("href=\"/sites/site_alpha/editor/page_home\"");
      expect(html).toContain("href=\"/sites/site_alpha/preview/page_home\"");
      expect(html).toContain("Edit in Studio");
    });

    it("renders zero-data empty state when sites list is empty", () => {
      const html = renderToString(<SiteListTable sites={[]} />);
      expect(html).toContain("No Websites Created Yet");
      expect(html).toContain("Launch Onboarding Wizard");
    });

    it("renders zero-data empty state when pages list is empty", () => {
      const html = renderToString(<PageExplorerTable siteId="site_empty" pages={[]} onCreatePage={() => {}} />);
      expect(html).toContain("No Pages Found");
      expect(html).toContain("Create First Page");
    });
  });

  describe("Dialog Components", () => {
    it("renders CreateSiteDialog when open", () => {
      const html = renderToString(
        <CreateSiteDialog isOpen={true} onClose={() => {}} onSubmit={() => {}} />
      );
      expect(html).toContain("Create New Website");
      expect(html).toContain("Website Name");
      expect(html).toContain(".business-os.site");
    });

    it("renders CreatePageDialog when open", () => {
      const html = renderToString(
        <CreatePageDialog isOpen={true} onClose={() => {}} onSubmit={() => {}} />
      );
      expect(html).toContain("Create New Page");
      expect(html).toContain("Page Title");
      expect(html).toContain("Set as Homepage");
    });
  });
});
