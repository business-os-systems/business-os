import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE_TOKENS,
  HOSTED_FONT_FAMILIES,
  HOSTED_FONT_STACKS,
  SCALE_STEPS,
  hostedFontById,
  isHostedFontStack,
  isLengthToken,
  isScaleStep,
  lengthLabel,
} from "../../src/appearance/index.js";

describe("scale steps (FR-074)", () => {
  it("contains every default the contract ships", () => {
    expect(SCALE_STEPS["type-size"]).toContain(DEFAULT_APPEARANCE_TOKENS.textHeroSize);
    expect(SCALE_STEPS["type-size"]).toContain(DEFAULT_APPEARANCE_TOKENS.textHeadingSize);
    expect(SCALE_STEPS["type-size"]).toContain(DEFAULT_APPEARANCE_TOKENS.textBodySize);
    expect(SCALE_STEPS["type-size"]).toContain(DEFAULT_APPEARANCE_TOKENS.textSmallSize);
    expect(SCALE_STEPS.radius).toContain(DEFAULT_APPEARANCE_TOKENS.radiusSm);
    expect(SCALE_STEPS.radius).toContain(DEFAULT_APPEARANCE_TOKENS.radiusMd);
    expect(SCALE_STEPS.radius).toContain(DEFAULT_APPEARANCE_TOKENS.radiusLg);
    expect(SCALE_STEPS.spacing).toContain(DEFAULT_APPEARANCE_TOKENS.spaceSection);
  });

  it("accepts a declared step and rejects a value off the scale", () => {
    expect(isScaleStep("type-size", "2.5rem")).toBe(true);
    expect(isScaleStep("type-size", "2.6rem")).toBe(false);
  });

  it("accepts only lengths the contract can store", () => {
    expect(isLengthToken("0")).toBe(true);
    expect(isLengthToken("2.5rem")).toBe(true);
    expect(isLengthToken("12px")).toBe(true);
    expect(isLengthToken("2.5")).toBe(false);
    expect(isLengthToken("two rem")).toBe(false);
  });

  it("shows the pixel equivalent for a rem value", () => {
    expect(lengthLabel("2.5rem")).toBe("2.5rem · 40px");
    expect(lengthLabel("12px")).toBe("12px");
  });
});

describe("hosted font registry (FR-015, FR-080)", () => {
  it("declares three to five families, each with files", () => {
    expect(HOSTED_FONT_FAMILIES.length).toBeGreaterThanOrEqual(3);
    expect(HOSTED_FONT_FAMILIES.length).toBeLessThanOrEqual(5);
    for (const family of HOSTED_FONT_FAMILIES) {
      expect(family.status).toBe("hosted");
      expect(family.files.length).toBeGreaterThan(0);
      expect(family.files[0]?.path.startsWith("/fonts/")).toBe(true);
    }
  });

  it("has unique stacks", () => {
    expect(new Set(HOSTED_FONT_STACKS).size).toBe(HOSTED_FONT_STACKS.length);
  });

  it("accepts a registry stack and rejects any other", () => {
    const fraunces = hostedFontById("fraunces");
    expect(fraunces).not.toBeNull();
    if (fraunces !== null) {
      expect(isHostedFontStack(fraunces.stack)).toBe(true);
    }
    expect(isHostedFontStack("Comic Sans MS, cursive")).toBe(false);
    expect(hostedFontById("not-a-font")).toBeNull();
  });
});
