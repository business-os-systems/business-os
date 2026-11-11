import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  PageExplorerTable,
  CreatePageSchema,
  CreatePageDialog,
  type PageSummary,
} from "../src/components/sites";

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

describe("Website Builder Pages Explorer", () => {
  describe("Zod Validation Schemas", () => {
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
      expect(html).toContain("href=\"/dashboard/sites/site_alpha/studio/page_home\"");
      expect(html).toContain("href=\"/dashboard/sites/site_alpha/preview/page_home\"");
      expect(html).toContain("Edit in Studio");
    });

    it("renders zero-data empty state when pages list is empty", () => {
      const html = renderToString(
        <PageExplorerTable siteId="site_empty" pages={[]} onCreatePage={() => {}} />
      );
      expect(html).toContain("No Pages Found");
      expect(html).toContain("Create First Page");
    });
  });

  describe("Dialog Components", () => {
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
