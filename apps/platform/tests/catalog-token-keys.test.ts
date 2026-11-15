import { describe, expect, it } from "vitest";
import { validateCatalogDraft } from "../src/lib/catalog-schema";

function themeDraft(tokens: Record<string, string | number>) {
  return {
    kind: "THEME",
    name: "Coastal Linen",
    slug: "coastal-linen",
    category: "hospitality",
    industries: [],
    contractVersion: "2026-03",
    flagKey: null,
    targeting: { plans: [], industries: [], orgAllowlist: [], orgDenylist: [] },
    definition: { schemaVersion: "2026-03", tokens },
  };
}

describe("theme token key set (FR-017)", () => {
  it("accepts a subset of the declared keys", () => {
    const result = validateCatalogDraft("THEME", themeDraft({ colorPrimary: "#1F5A44" }));
    expect(result.ok).toBe(true);
  });

  it("rejects an undeclared key and names it", () => {
    const result = validateCatalogDraft(
      "THEME",
      themeDraft({ colorPrimary: "#1F5A44", primaryColor: "#FFFFFF" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path.endsWith("primaryColor"));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("primaryColor");
      expect(issue?.path).toBe("definition.tokens.primaryColor");
    }
  });

  it("rejects a reserved object property", () => {
    const tokens: Record<string, string> = Object.fromEntries([["__proto__", "#000000"]]);
    const result = validateCatalogDraft("THEME", themeDraft(tokens));
    expect(result.ok).toBe(false);
  });
});

describe("theme token values (FR-018)", () => {
  it("rejects a colour that is not six-digit hex", () => {
    const result = validateCatalogDraft("THEME", themeDraft({ colorPrimary: "red" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((entry) => entry.path === "definition.tokens.colorPrimary")).toBe(true);
    }
  });

  it("rejects a size without a unit", () => {
    const result = validateCatalogDraft("THEME", themeDraft({ textHeroSize: "3.75" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a numeric value where text is declared", () => {
    const result = validateCatalogDraft("THEME", themeDraft({ spaceSection: 64 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((entry) => entry.message.includes("text"))).toBe(true);
    }
  });

  it("accepts every default the contract ships", () => {
    const result = validateCatalogDraft(
      "THEME",
      themeDraft({
        colorBackground: "#FAF3EF",
        colorSurface: "#FFFFFF",
        colorText: "#1E1B19",
        colorTextMuted: "#6E625D",
        colorPrimary: "#A43A2B",
        colorPrimaryContrast: "#FFFFFF",
        colorAccent: "#0F766E",
        colorBorder: "#E9E2DE",
        fontHeading: "Inter, system-ui, sans-serif",
        fontBody: "Inter, system-ui, sans-serif",
        textHeroSize: "3.75rem",
        textHeadingSize: "2.25rem",
        textBodySize: "1rem",
        textSmallSize: "0.875rem",
        radiusSm: "0.375rem",
        radiusMd: "0.5rem",
        radiusLg: "0.75rem",
        shadowCard: "0 1px 2px rgba(30, 27, 25, 0.08)",
        spaceSection: "4rem",
      })
    );
    expect(result.ok).toBe(true);
  });
});
