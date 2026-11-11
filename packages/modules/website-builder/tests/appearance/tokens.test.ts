import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TOKEN_KEYS,
  DEFAULT_APPEARANCE_TOKENS,
  appearanceCssVariables,
  appearanceTokensFromTheme,
  normalizeAppearanceTokens,
} from "../../src/appearance/tokens.js";

describe("appearance token snapshot (T114, FR-150..FR-157)", () => {
  it("normalises an empty snapshot into a complete token set", () => {
    const tokens = normalizeAppearanceTokens(null);
    expect(Object.keys(tokens).sort()).toEqual([...APPEARANCE_TOKEN_KEYS].sort());
    expect(tokens).toEqual(DEFAULT_APPEARANCE_TOKENS);
  });

  it("fills a token introduced later without changing the stored values", () => {
    const tokens = normalizeAppearanceTokens({ colorPrimary: "#123456" });
    expect(tokens.colorPrimary).toBe("#123456");
    expect(tokens.spaceSection).toBe(DEFAULT_APPEARANCE_TOKENS.spaceSection);
  });

  it("copies catalog theme values and fills the tokens the theme omits", () => {
    const tokens = appearanceTokensFromTheme({
      colorPrimary: "#123456",
      fontHeading: "Georgia, serif",
      unknownFutureToken: "ignored",
    });
    expect(tokens.colorPrimary).toBe("#123456");
    expect(tokens.fontHeading).toBe("Georgia, serif");
    expect(tokens.colorBackground).toBe(DEFAULT_APPEARANCE_TOKENS.colorBackground);
  });

  it("rejects a malformed declared token instead of silently restyling", () => {
    expect(() => appearanceTokensFromTheme({ colorPrimary: "red" })).toThrow();
  });

  it("maps every token to a CSS custom property", () => {
    const variables = appearanceCssVariables(DEFAULT_APPEARANCE_TOKENS);
    expect(Object.keys(variables)).toHaveLength(APPEARANCE_TOKEN_KEYS.length);
    expect(variables["--cms-shadow-card"]).toBe(DEFAULT_APPEARANCE_TOKENS.shadowCard);
  });
});
