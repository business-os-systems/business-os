import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildStarterCatalogSeed, STARTER_SECTION_BLOCK_TYPES } from "@suite/db";
import { BlockAstSchema, PageAstSchema } from "@suite/website-builder/ast";

/**
 * The add-a-section-type procedure
 * (specs/010-website-builder/app/adding-a-section-type.md) is only real if the
 * five registration points agree. This suite fails when a block type exists in
 * one place and not the others.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const BLOCKS_DIR = path.join(
  REPO_ROOT,
  "packages/modules/website-builder/src/components/blocks"
);
const BLOCKS_INDEX = path.join(BLOCKS_DIR, "index.ts");
const INSPECTOR_CONFIG = path.join(
  REPO_ROOT,
  "packages/modules/website-builder/src/editor/inspector/block-form-config.ts"
);

/** Literal colour and palette-class audit every block source must pass. */
const FORBIDDEN_STYLE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/;

function astBlockTypes(): readonly string[] {
  return BlockAstSchema.options.map((option) => option.shape.type.value);
}

function blockSource(type: string): string {
  return path.join(BLOCKS_DIR, type + "-block.tsx");
}

describe("section-type registry (FR-071)", () => {
  it("declares exactly the seeded launch block types in the AST union", () => {
    expect([...astBlockTypes()].sort()).toEqual([...STARTER_SECTION_BLOCK_TYPES].sort());
  });

  it("ships one valid token-styled component per block type", () => {
    const missing = STARTER_SECTION_BLOCK_TYPES.filter((type) => !existsSync(blockSource(type)));
    expect(missing, "every block type needs <type>-block.tsx").toEqual([]);

    const offenders = STARTER_SECTION_BLOCK_TYPES.filter((type) =>
      FORBIDDEN_STYLE.test(readFileSync(blockSource(type), "utf8"))
    );
    expect(offenders, "blocks render only site tokens, never literal colours").toEqual([]);

    const index = readFileSync(BLOCKS_INDEX, "utf8");
    const unexported = STARTER_SECTION_BLOCK_TYPES.filter(
      (type) => !index.includes("./" + type + "-block.js")
    );
    expect(unexported, "every block component must be exported").toEqual([]);
  });

  it("declares inspector fields for every block type", () => {
    const declaredLines = readFileSync(INSPECTOR_CONFIG, "utf8")
      .split("\n")
      .map((line) => line.trim());
    const undeclared = STARTER_SECTION_BLOCK_TYPES.filter((type) => {
      const plainKey = type + ": {";
      const quotedKey = '"' + type + '": {';
      return !declaredLines.includes(plainKey) && !declaredLines.includes(quotedKey);
    });
    expect(undeclared).toEqual([]);
  });

  it("seeds a valid published section for every block type", () => {
    const seed = buildStarterCatalogSeed();
    const seededTypes = seed.sections.map((section) => section.definition.block.type);

    expect([...new Set(seededTypes)].sort()).toEqual([...STARTER_SECTION_BLOCK_TYPES].sort());
    for (const section of seed.sections) {
      expect(BlockAstSchema.safeParse(section.definition.block).success).toBe(true);
    }
  });

  it("keeps the seeded template blueprint readable by the page AST schema", () => {
    const seed = buildStarterCatalogSeed();

    for (const page of seed.template.definition.pages) {
      expect(PageAstSchema.safeParse(page).success).toBe(true);
    }
  });
});
