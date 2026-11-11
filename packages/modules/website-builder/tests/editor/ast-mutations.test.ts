import { describe, expect, it } from "vitest";
import {
  deleteBlock,
  deleteSection,
  duplicateBlock,
  duplicateSection,
  insertCatalogBlock,
  moveBlock,
  moveSection,
  updateBlockProps,
} from "../../src/editor/ast-mutations.js";
import type { BlockAst, PageAst } from "../../src/ast/types.js";

const HERO: BlockAst = { id: "blk_one", type: "hero", props: { headline: "One" } };
const SECOND: BlockAst = { id: "blk_two", type: "hero", props: { headline: "Two" } };

function page(): PageAst {
  return {
    version: 1,
    schemaVersion: "2026-03",
    sections: [
      { id: "sec_one", name: "One", blocks: [HERO, SECOND] },
      { id: "sec_two", name: "Two", blocks: [] },
    ],
  };
}

describe("Editor AST mutations (FR-022)", () => {
  it("adds a catalog section with fresh ids", () => {
    const next = insertCatalogBlock({ ast: page(), block: HERO, name: "Catalog hero" });
    expect(next.sections).toHaveLength(3);
    const added = next.sections[2];
    expect(added?.id).not.toBe("sec_one");
    expect(added?.blocks[0]?.id).not.toBe("blk_one");
  });

  it("duplicates, moves and deletes sections", () => {
    const duplicated = duplicateSection({ ast: page(), sectionId: "sec_one" });
    expect(duplicated.sections).toHaveLength(3);
    expect(duplicated.sections[1]?.id).not.toBe("sec_one");
    expect(moveSection({ ast: page(), sectionId: "sec_one", direction: "down" }).sections[0]?.id).toBe("sec_two");
    expect(deleteSection({ ast: page(), sectionId: "sec_one" }).sections.map((entry) => entry.id)).toEqual([
      "sec_two",
    ]);
  });

  it("duplicates, moves and deletes blocks inside a section", () => {
    expect(duplicateBlock({ ast: page(), sectionId: "sec_one", blockId: "blk_one" }).sections[0]?.blocks).toHaveLength(3);
    expect(
      moveBlock({ ast: page(), sectionId: "sec_one", blockId: "blk_one", direction: "down" }).sections[0]?.blocks[0]
        ?.id
    ).toBe("blk_two");
    expect(
      deleteBlock({ ast: page(), sectionId: "sec_one", blockId: "blk_one" }).sections[0]?.blocks
    ).toHaveLength(1);
  });

  it("rejects an edit that would break the AST schema", () => {
    const next = updateBlockProps({ ast: page(), blockId: "blk_one", props: { headline: "" } });
    expect(next.sections[0]?.blocks[0]).toEqual(HERO);
    const valid = updateBlockProps({ ast: page(), blockId: "blk_one", props: { headline: "Updated" } });
    expect(valid.sections[0]?.blocks[0]).toMatchObject({ props: { headline: "Updated" } });
  });
});
