import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CSS_VAR_BY_TOKEN,
  APPEARANCE_TOKEN_KEYS,
  DEFAULT_APPEARANCE_TOKENS,
  TEXT_SIZE_ROLE_KEYS,
  appearanceCssVariables,
  normalizeAppearanceTokens,
  responsiveTextRoleStyles,
} from "../../src/appearance/index.js";

describe("contract coverage (T017)", () => {
  it("gives every declared key a default", () => {
    for (const key of APPEARANCE_TOKEN_KEYS) {
      expect(DEFAULT_APPEARANCE_TOKENS[key], key).toBeTypeOf("string");
    }
    expect(Object.keys(DEFAULT_APPEARANCE_TOKENS).sort()).toEqual([...APPEARANCE_TOKEN_KEYS].sort());
  });

  it("gives every declared key a CSS variable and a rendered value", () => {
    const variables = appearanceCssVariables(DEFAULT_APPEARANCE_TOKENS);
    for (const key of APPEARANCE_TOKEN_KEYS) {
      expect(APPEARANCE_CSS_VAR_BY_TOKEN[key], key).toMatch(/^--cms-/);
      expect(variables[APPEARANCE_CSS_VAR_BY_TOKEN[key]], key).toBe(DEFAULT_APPEARANCE_TOKENS[key]);
    }
  });

  it("normalises every declared key back to the default when absent", () => {
    const resolved = normalizeAppearanceTokens({});
    for (const key of APPEARANCE_TOKEN_KEYS) {
      expect(resolved[key], key).toBe(DEFAULT_APPEARANCE_TOKENS[key]);
    }
  });

  it("renders a responsive rule for every size role", () => {
    const css = responsiveTextRoleStyles();
    for (const key of TEXT_SIZE_ROLE_KEYS) {
      const variable = APPEARANCE_CSS_VAR_BY_TOKEN[key].replace("--cms-", "--cms-");
      expect(css, key).toContain(variable);
    }
    expect(css).toContain("@media (min-width:1024px)");
  });
});
