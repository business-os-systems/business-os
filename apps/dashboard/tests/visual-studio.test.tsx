import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { StudioHeader } from "../src/components/editor/studio-header";
import { StudioWorkspace } from "../src/components/editor/studio-workspace";

vi.mock("next/navigation", () => ({
  useParams: () => ({ siteId: "site_test_01", pageId: "page_test_01" }),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Website Builder Visual Studio & Live Canvas Mounting (@suite/dashboard)", () => {
  describe("StudioHeader Rendering", () => {
    it("renders exit studio link, page breadcrumbs, and revision status", () => {
      const html = renderToString(
        <StudioHeader
          siteId="site_riverview"
          pageId="page_home"
          pageTitle="Homepage & Hero"
          revision={5}
          status="PUBLISHED"
          autosaveStatus="saved"
          isLayersOpen={true}
          isInspectorOpen={true}
          onToggleLayers={() => {}}
          onToggleInspector={() => {}}
          onOpenAddDrawer={() => {}}
        />
      );

      expect(html).toContain("Exit Studio");
      expect(html).toContain("href=\"/sites/site_riverview/pages\"");
      expect(html).toContain("site_riverview");
      expect(html).toContain("Homepage &amp; Hero");
      expect(html).toContain("PUBLISHED");
      expect(html).toContain("CAS Revision: v5");
      expect(html).toContain("Add Block");
      expect(html).toContain("Preview");
      expect(html).toContain("Layers");
      expect(html).toContain("Inspector");
    });
  });

  describe("StudioWorkspace Full Layout & Multi-Pane Mounting", () => {
    it("mounts VisualCanvas, BlockTreeSidebar, and BlockPropertyInspector", () => {
      const testAst = {
        version: 1 as const,
        schemaVersion: "2026-03" as const,
        sections: [
          {
            id: "sec_hero",
            name: "Hero Showcase",
            blocks: [
              {
                id: "b_hero_1",
                type: "hero" as const,
                props: { headline: "Artisanal Dining by the Waterfront" },
              },
            ],
          },
          {
            id: "sec_features",
            name: "Core Highlights",
            blocks: [
              {
                id: "b_feat_1",
                type: "features" as const,
                props: { headline: "The Culinary Experience", features: [] },
              },
            ],
          },
          {
            id: "sec_pricing",
            name: "Tasting Menus",
            blocks: [],
          },
        ],
      };

      const html = renderToString(
        <StudioWorkspace
          siteId="site_riverview"
          pageId="page_home"
          pageTitle="Main Storefront"
          revision={3}
          status="DRAFT"
          initialAst={testAst}
        />
      );

      // Verify Left Sidebar (BlockTreeSidebar)
      expect(html).toContain("Page Layers");
      expect(html).toContain("Hero Showcase");
      expect(html).toContain("Core Highlights");
      expect(html).toContain("Tasting Menus");

      // Verify Center Canvas (VisualCanvas)
      expect(html).toContain("data-canvas-workspace=\"true\"");
      expect(html).toContain("Artisanal Dining by the Waterfront");
      expect(html).toContain("The Culinary Experience");

      // Verify Right Inspector (BlockPropertyInspector)
      expect(html).toContain("No Block Selected");

      // Verify Header
      expect(html).toContain("CAS Revision: v3");
      expect(html).toContain("DRAFT");
    });
  });
});
