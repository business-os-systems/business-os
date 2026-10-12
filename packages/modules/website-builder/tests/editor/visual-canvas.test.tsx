import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  VisualCanvas,
  ViewportToolbar,
  CanvasBlockWrapper,
  VIEWPORT_CONFIGS,
} from "../../src/editor/canvas/index.js";
import type { PageAst, BlockAst } from "../../src/ast/types.js";

describe("Visual Canvas & Viewport Simulation Shell", () => {
  const sampleAst: PageAst = {
    version: 1,
    schemaVersion: "2026-03",
    globalStyles: {
      fontFamily: "Inter, sans-serif",
      backgroundColor: "#ffffff",
    },
    sections: [
      {
        id: "sec_hero",
        styles: { maxWidth: "xl" },
        blocks: [
          {
            id: "b_hero_1",
            type: "hero",
            props: {
              headline: "Mountain Cabin Retreat",
              subheadline: "Escape the noise",
            },
          },
        ],
      },
      {
        id: "sec_features",
        blocks: [
          {
            id: "b_feat_1",
            type: "features",
            props: {
              headline: "Amenities",
              features: [{ id: "i1", title: "Sauna", description: "Wood-fired" }],
            },
          },
        ],
      },
    ],
  };

  it("renders viewport simulation controls with device options and default widths", () => {
    expect(VIEWPORT_CONFIGS.mobile.width).toBe(375);
    expect(VIEWPORT_CONFIGS.tablet.width).toBe(768);
    expect(VIEWPORT_CONFIGS.desktop.width).toBe(1280);

    const onDeviceChange = vi.fn();
    const onZoomChange = vi.fn();

    const toolbarHtml = renderToString(
      <ViewportToolbar
        device="desktop"
        zoom={1.0}
        onDeviceChange={onDeviceChange}
        onZoomChange={onZoomChange}
      />
    );

    expect(toolbarHtml).toContain("Desktop");
    expect(toolbarHtml).toContain("Tablet");
    expect(toolbarHtml).toContain("Mobile");
    expect(toolbarHtml).toContain("100%");
    expect(toolbarHtml).toContain("Desktop (1280px)");
  });

  it("renders VisualCanvas with proper frame width and transform scale", () => {
    const canvasHtml = renderToString(
      <VisualCanvas ast={sampleAst} device="mobile" zoom={0.8} />
    );

    expect(canvasHtml).toContain("data-viewport-device=\"mobile\"");
    expect(canvasHtml).toContain("data-viewport-width=\"375\"");
    expect(canvasHtml).toContain("width:375px");
    expect(canvasHtml).toContain("scale(0.8)");
    expect(canvasHtml).toContain("Mountain Cabin Retreat");
  });

  it("renders CanvasBlockWrapper with focus bounding boxes and badges when selected or hovered", () => {
    const block: BlockAst = {
      id: "b_hero_test",
      type: "hero",
      props: {
        headline: "Hero Test",
      },
    };

    const selectedHtml = renderToString(
      <CanvasBlockWrapper
        block={block}
        isSelected={true}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );

    expect(selectedHtml).toContain("data-canvas-block-id=\"b_hero_test\"");
    expect(selectedHtml).toContain("data-selected=\"true\"");
    expect(selectedHtml).toContain("ring-2 ring-blue-600");
    expect(selectedHtml).toContain("hero");

    const unselectedHtml = renderToString(
      <CanvasBlockWrapper
        block={block}
        isSelected={false}
        isHovered={false}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    );

    expect(unselectedHtml).not.toContain("data-selected=\"true\"");
    expect(unselectedHtml).toContain("ring-0");
  });

  it("highlights section outline when section is actively selected", () => {
    const canvasHtml = renderToString(
      <VisualCanvas
        ast={sampleAst}
        selection={{
          selectedBlockId: null,
          hoveredBlockId: null,
          selectedSectionId: "sec_hero",
        }}
      />
    );

    expect(canvasHtml).toContain("outline-indigo-500");
  });
});
