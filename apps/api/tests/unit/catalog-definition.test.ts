import { describe, expect, it } from "vitest";
import {
  CATALOG_DEFINITION_LIMITS,
  validateCatalogDefinition,
} from "../../src/services/admin/app-catalog.contract.js";

const SECTION_DEFINITION = {
  schemaVersion: "2026-03",
  block: {
    id: "blk_hero_bounds",
    type: "hero",
    props: { headline: "Welcome" },
  },
};

function nestingIssue(result: ReturnType<typeof validateCatalogDefinition>): string {
  if (result.success) {
    throw new Error("Expected the definition to be rejected");
  }
  return result.issues[0]?.message ?? "";
}

describe("catalog definition bounds", () => {
  it("accepts a definition inside the declared bounds", () => {
    const result = validateCatalogDefinition("SECTION", SECTION_DEFINITION);
    expect(result.success).toBe(true);
  });

  it("rejects nesting deeper than the declared limit before the kind schema runs", () => {
    let nested: unknown = "leaf";
    for (let level = 0; level <= CATALOG_DEFINITION_LIMITS.maxDepth; level += 1) {
      nested = { child: nested };
    }

    const result = validateCatalogDefinition("THEME", {
      schemaVersion: "2026-03",
      tokens: {},
      nesting: nested,
    });

    expect(nestingIssue(result)).toMatch(/nesting exceeds/i);
  });

  it("rejects a prototype-polluting key anywhere in the definition", () => {
    const tokens = Object.fromEntries([
      ["__proto__", "red"],
      ["primary", "blue"],
    ]);

    const result = validateCatalogDefinition("THEME", {
      schemaVersion: "2026-03",
      tokens,
    });

    expect(nestingIssue(result)).toMatch(/__proto__/);
  });

  it("rejects a definition larger than the declared encoded size", () => {
    const tokens: Record<string, string> = {};
    const chunk = "x".repeat(1000);
    for (let index = 0; index < 1200; index += 1) {
      tokens["token_" + String(index)] = chunk;
    }

    const result = validateCatalogDefinition("THEME", {
      schemaVersion: "2026-03",
      tokens,
    });

    expect(nestingIssue(result)).toMatch(/encoded bytes/i);
  });
});
