import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  AddSectionDrawer,
  groupCatalogSections,
  matchesCatalogQuery,
  type CatalogSection,
  type CatalogSectionsState,
} from "../../src/editor/layers/index.js";

function section(overrides: Partial<CatalogSection> & Pick<CatalogSection, "id" | "name" | "category">): CatalogSection {
  return {
    slug: overrides.id,
    industries: ["hospitality"],
    currentVersion: 1,
    previewRef: null,
    definition: {
      schemaVersion: "2026-03",
      block: { id: "blk_catalog", type: "hero", props: { headline: "Catalog hero" } },
    },
    ...overrides,
  };
}

const SECTIONS: CatalogSection[] = [
  section({ id: "cat_hero", name: "Restaurant hero", category: "hospitality" }),
  section({ id: "cat_menu", name: "Menu highlights", category: "hospitality" }),
  section({ id: "cat_retail", name: "Retail feature grid", category: "retail", industries: ["retail"] }),
];

function firstSection(): CatalogSection {
  const first = SECTIONS[0];
  if (first === undefined) {
    throw new Error("The fixture needs at least one section");
  }
  return first;
}

function thirdSection(): CatalogSection {
  const third = SECTIONS[2];
  if (third === undefined) {
    throw new Error("The fixture needs three sections");
  }
  return third;
}

function renderDrawer(catalog: CatalogSectionsState, isOpen = true): string {
  return renderToString(
    <AddSectionDrawer
      isOpen={isOpen}
      catalog={catalog}
      onClose={vi.fn()}
      onRetry={vi.fn()}
      onInsert={vi.fn()}
    />
  );
}

describe("Add-section drawer (T068)", () => {
  it("renders only the sections the tenant catalog returned, grouped by category", () => {
    const html = renderDrawer({ kind: "ready", sections: SECTIONS });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Restaurant hero");
    expect(html).toContain("Menu highlights");
    expect(html).toContain("Retail feature grid");
    expect(html).toContain("Hospitality");
    expect(html).toContain("Retail");
    expect(html).toContain('data-catalog-group="hospitality"');
    expect(html).toContain("Search sections");
  });

  it("reports loading, error and empty catalog states honestly", () => {
    expect(renderDrawer({ kind: "loading" })).toContain("Loading sections from the catalog");
    const failed = renderDrawer({ kind: "error", message: "Catalog unavailable" });
    expect(failed).toContain("Catalog unavailable");
    expect(failed).toContain("Try again");
    const empty = renderDrawer({ kind: "ready", sections: [] });
    expect(empty).toContain("No sections are available for this workspace yet.");
  });

  it("renders nothing when closed", () => {
    expect(renderDrawer({ kind: "ready", sections: SECTIONS }, false)).toBe("");
  });

  it("searches across name, category and industry", () => {
    expect(matchesCatalogQuery(firstSection(), "restaurant")).toBe(true);
    expect(matchesCatalogQuery(thirdSection(), "retail")).toBe(true);
    expect(matchesCatalogQuery(firstSection(), "spa")).toBe(false);
    expect(groupCatalogSections(SECTIONS).map((group) => group.category)).toEqual([
      "hospitality",
      "retail",
    ]);
  });
});
