import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  BlockTreeSidebar,
  AddBlockDrawer,
  BLOCK_BLUEPRINTS,
} from "../../src/editor/layers/index.js";
import { BlockAstSchema } from "../../src/ast/schema.js";
import type { SectionAst } from "../../src/ast/types.js";

describe("Visual Block Tree & Add-Block Drawer", () => {
  const sampleSections: SectionAst[] = [
    {
      id: "sec_hero",
      name: "Header Banner",
      blocks: [
        {
          id: "b_hero_1",
          type: "hero",
          props: { headline: "Hero Title" },
        },
      ],
    },
    {
      id: "sec_faq",
      name: "Customer FAQ",
      visibility: { hideOnDesktop: true },
      blocks: [
        {
          id: "b_faq_1",
          type: "faq",
          props: { items: [] },
        },
      ],
    },
  ];

  it("contains blueprints for all 8 core block types with valid default templates", () => {
    const keys = Object.keys(BLOCK_BLUEPRINTS);
    expect(keys).toHaveLength(8);
    expect(keys).toContain("hero");
    expect(keys).toContain("features");
    expect(keys).toContain("pricing");
    expect(keys).toContain("form");
    expect(keys).toContain("faq");
    expect(keys).toContain("rich-text");
    expect(keys).toContain("navbar");
    expect(keys).toContain("footer");

    for (const [, blueprint] of Object.entries(BLOCK_BLUEPRINTS)) {
      const block = blueprint.createDefaultBlock("11111111-1111-1111-1111-111111111111");
      const validation = BlockAstSchema.safeParse(block);
      if (!validation.success) {
        console.error("ZOD FAILED FOR", blueprint.type, JSON.stringify(validation.error.issues, null, 2));
      }
      expect(validation.success).toBe(true);
    }
  });

  it("renders BlockTreeSidebar with section hierarchy, indices, and action buttons", () => {
    const html = renderToString(
      <BlockTreeSidebar
        sections={sampleSections}
        selectedSectionId="sec_hero"
        selectedBlockId="b_hero_1"
        onSelectSection={vi.fn()}
        onSelectBlock={vi.fn()}
        onMoveSection={vi.fn()}
        onDeleteSection={vi.fn()}
        onToggleSectionVisibility={vi.fn()}
        onOpenAddDrawer={vi.fn()}
      />
    );

    expect(html).toContain("Page Layers");
    expect(html).toContain("Header Banner");
    expect(html).toContain("Customer FAQ");
    expect(html).toContain("sec_hero");
    expect(html).toContain("sec_faq");
    expect(html).toContain("b_hero_1");
    expect(html).toContain("b_faq_1");
  });

  it("renders AddBlockDrawer dialog when isOpen is true with blueprint cards and tabs", () => {
    const html = renderToString(
      <AddBlockDrawer
        isOpen={true}
        onClose={vi.fn()}
        onAddBlock={vi.fn()}
        onAddSection={vi.fn()}
      />
    );

    expect(html).toContain("Block Blueprint Library");
    expect(html).toContain("All Blocks");
    expect(html).toContain("Marketing");
    expect(html).toContain("Commerce");
    expect(html).toContain("Hero Banner");
    expect(html).toContain("Feature Grid");
    expect(html).toContain("Pricing Table");
    expect(html).toContain("Insert Block");
  });

  it("does not render AddBlockDrawer DOM when isOpen is false", () => {
    const html = renderToString(
      <AddBlockDrawer
        isOpen={false}
        onClose={vi.fn()}
        onAddBlock={vi.fn()}
        onAddSection={vi.fn()}
      />
    );

    expect(html).toBe("");
  });
});
