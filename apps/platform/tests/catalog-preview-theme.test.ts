import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { previewTokensFor } from "../src/components/catalog/use-catalog-preview-theme";

describe("preview theme tokens", () => {
  const sources = [
    { id: "theme-1", definition: { tokens: { colorPrimary: "#1F5A44" } } },
  ];

  it("falls back to the platform appearance without a selection", () => {
    expect(previewTokensFor(sources, null)).toEqual(DEFAULT_APPEARANCE_TOKENS);
  });

  it("falls back when the selected theme is not published any more", () => {
    expect(previewTokensFor(sources, "gone")).toEqual(DEFAULT_APPEARANCE_TOKENS);
  });

  it("normalises a partial theme against the contract defaults", () => {
    const tokens = previewTokensFor(sources, "theme-1");
    expect(tokens.colorPrimary).toBe("#1F5A44");
    expect(tokens.textHeroSize).toBe(DEFAULT_APPEARANCE_TOKENS.textHeroSize);
    expect(tokens.colorBorder).toBe(DEFAULT_APPEARANCE_TOKENS.colorBorder);
  });
});
