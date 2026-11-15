import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TOKEN_KEYS,
  DEFAULT_APPEARANCE_TOKENS,
  TEXT_SIZE_ROLE_KEYS,
  normalizeAppearanceTokens,
  SIZE_FACTORS,
  responsiveTextRoleStyles,
} from "../../src/appearance/index.js";

describe("appearance size roles (FR-016, FR-081)", () => {
  it("declares the four size roles in the contract", () => {
    expect(TEXT_SIZE_ROLE_KEYS).toHaveLength(4);
    for (const key of TEXT_SIZE_ROLE_KEYS) {
      expect(APPEARANCE_TOKEN_KEYS).toContain(key);
    }
  });

  it("defaults reproduce today's rendered sizes", () => {
    expect(DEFAULT_APPEARANCE_TOKENS.textHeroSize).toBe("3.75rem");
    expect(DEFAULT_APPEARANCE_TOKENS.textHeadingSize).toBe("2.25rem");
    expect(DEFAULT_APPEARANCE_TOKENS.textBodySize).toBe("1rem");
    expect(DEFAULT_APPEARANCE_TOKENS.textSmallSize).toBe("0.875rem");
  });

  it("fills a snapshot that predates the roles with the defaults", () => {
    const resolved = normalizeAppearanceTokens({ colorPrimary: "#123456" });
    expect(resolved.textHeroSize).toBe("3.75rem");
    expect(resolved.textSmallSize).toBe("0.875rem");
    expect(resolved.colorPrimary).toBe("#123456");
  });

  it("derives a narrow size per role from the stored one", () => {
    expect(SIZE_FACTORS.textHeroSize).toEqual({ narrow: 0.6, medium: 0.8 });
    expect(SIZE_FACTORS.textHeadingSize.narrow).toBeCloseTo(1.875 / 2.25, 5);
    expect(SIZE_FACTORS.textBodySize).toEqual({ narrow: 1, medium: 1 });
  });

  it("emits a rendered variable for every role, at each breakpoint", () => {
    const css = responsiveTextRoleStyles();
    for (const role of ["hero", "heading", "body", "small"]) {
      expect(css).toContain("--cms-text-" + role + "-rendered");
    }
    expect(css).toContain("@media");
    expect(css).toContain("calc(");
  });
});
