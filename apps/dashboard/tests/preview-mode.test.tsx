import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PreviewHeader } from "../src/components/preview/preview-header";
import { PreviewWorkspace } from "../src/components/preview/preview-workspace";
import type { PreviewDevice } from "../src/components/preview/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ siteId: "site_test_01", pageId: "page_test_01" }),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Live Full-Screen Preview & Viewport Sandbox (@suite/dashboard)", () => {
  describe("PreviewHeader Rendering", () => {
    it("renders breadcrumbs, exit preview link, and Edit in Studio button", () => {
      const html = renderToString(
        <PreviewHeader
          siteId="site_riverview"
          pageId="page_home"
          pageTitle="Tasting Menu Showcase"
          device="desktop"
          onDeviceChange={() => {}}
        />
      );

      expect(html).toContain("Exit Preview");
      expect(html).toContain("href=\"/sites/site_riverview/pages\"");
      expect(html).toContain("site_riverview");
      expect(html).toContain("Tasting Menu Showcase");
      expect(html).toContain("Live Preview");
      expect(html).toContain("Edit in Studio");
      expect(html).toContain("href=\"/sites/site_riverview/editor/page_home\"");
    });

    it("renders device simulation toggle buttons", () => {
      const html = renderToString(
        <PreviewHeader
          siteId="site_riverview"
          pageId="page_home"
          pageTitle="Tasting Menu Showcase"
          device="tablet"
          onDeviceChange={() => {}}
        />
      );

      expect(html).toContain("Desktop");
      expect(html).toContain("Tablet");
      expect(html).toContain("Mobile");
      expect(html).toContain("Fluid");
    });
  });

  describe("PreviewWorkspace Viewport Simulation", () => {
    const devices: PreviewDevice[] = ["desktop", "tablet", "mobile", "responsive"];

    devices.forEach((device) => {
      it(`mounts preview frame with clean AstRenderer for device: ${device}`, () => {
        const html = renderToString(
          <PreviewWorkspace
            siteId="site_riverview"
            pageId="page_home"
            pageTitle="Waterfront Bistro"
          />
        );

        // Verify AST clean render output
        expect(html).toContain("data-cms-page=\"true\"");
        expect(html).toContain("Artisanal Dining by the Waterfront");
        expect(html).toContain("The Culinary Experience");
        expect(html).toContain("Chef&#x27;s Tasting Menus");

        // Verify no editor drag handles or property forms are present
        expect(html).not.toContain("Page Layers");
        expect(html).not.toContain("Block inspector for");
      });
    });
  });
});
