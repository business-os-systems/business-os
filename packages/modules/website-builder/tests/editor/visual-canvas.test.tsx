import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  NO_SELECTION,
  selectBlock,
  selectSection,
  VisualCanvas,
} from "../../src/editor/canvas/index.js";
import type { PageAst } from "../../src/ast/types.js";

const PAGE: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [
    {
      id: "sec_hero",
      name: "Hero",
      blocks: [
        {
          id: "blk_hero",
          type: "hero",
          props: { headline: "Harbour views and quiet rooms" },
        },
      ],
    },
  ],
};

function renderCanvas(input: {
  readonly ast?: PageAst;
  readonly selection?: Parameters<typeof VisualCanvas>[0]["selection"];
  readonly readOnly?: boolean;
} = {}): string {
  return renderToString(
    <VisualCanvas
      ast={input.ast ?? PAGE}
      device="desktop"
      zoom={1}
      selection={input.selection ?? NO_SELECTION}
      readOnly={input.readOnly ?? false}
      onSelect={vi.fn()}
      onZoomChange={vi.fn()}
      onOpenCatalog={vi.fn()}
    />
  );
}

describe("Visual canvas (T066)", () => {
  it("renders the production AST inside the viewport frame", () => {
    const html = renderCanvas();
    expect(html).toContain("Harbour views and quiet rooms");
    expect(html).toContain('data-canvas-workspace="true"');
    expect(html).toContain('data-viewport-device="desktop"');
    expect(html).toContain("Desktop (1280px)");
    expect(html).toContain("Zoom out");
    expect(html).toContain("Reset zoom to 100%");
  });

  it("exposes every section and block through an accessible outline", () => {
    const html = renderCanvas();
    expect(html).toContain('aria-label="Section Hero"');
    expect(html).toContain('aria-label="Select hero block"');
    expect(html).toContain('data-canvas-section-id="sec_hero"');
    expect(html).toContain('data-canvas-block-id="blk_hero"');
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="0"');
  });

  it("marks the selected block and the selected section", () => {
    const blockHtml = renderCanvas({ selection: selectBlock("sec_hero", "blk_hero") });
    expect(blockHtml).toContain('data-selected="true"');
    expect(blockHtml).toContain('aria-current="true"');
    const sectionHtml = renderCanvas({ selection: selectSection("sec_hero") });
    expect(sectionHtml).toContain("outline outline-2 outline-focus-ring");
  });

  it("renders a genuine empty state that opens the catalog", () => {
    const html = renderCanvas({ ast: { version: 1, schemaVersion: "2026-03", sections: [] } });
    expect(html).toContain("This page is blank");
    expect(html).toContain("Add a section");
  });

  it("removes blocks from the tab order for a read-only session", () => {
    const html = renderCanvas({ readOnly: true });
    expect(html).toContain('tabindex="-1"');
  });
});
