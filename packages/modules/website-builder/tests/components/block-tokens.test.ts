import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_APPEARANCE_TOKENS } from "../../src/appearance/index.js";
import {
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_SECTION_PADDING,
  optionalColorToken,
  resolveColorToken,
} from "../../src/components/blocks/block-tokens.js";

const BLOCK_ROOT = join(process.cwd(), "src/components/blocks");
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;
const PALETTE_CLASS =
  /(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|placeholder|accent|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

function blockSources(): string[] {
  return readdirSync(BLOCK_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(BLOCK_ROOT, entry.name));
}

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(colour: string): number {
  const value = Number.parseInt(colour.slice(1), 16);
  const red = linearize((value >> 16) & 0xff);
  const green = linearize((value >> 8) & 0xff);
  const blue = linearize(value & 0xff);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)];
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Block design-token discipline (F11, FR-153)", () => {
  it("contains no literal colour value or palette utility class", () => {
    const violations = blockSources().flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines.flatMap((line, index) =>
        RAW_COLOUR.test(line) || PALETTE_CLASS.test(line)
          ? [file + ":" + String(index + 1) + " " + line.trim()]
          : []
      );
    });
    expect(violations).toEqual([]);
  });

  it("never renders a stored custom class name", () => {
    const violations = blockSources().filter((file) =>
      readFileSync(file, "utf8").includes("customClassName")
    );
    expect(violations).toEqual([]);
  });

  it("derives every block colour and font from a site token", () => {
    expect(BLOCK_COLORS.surface).toContain("--cms-color-surface");
    expect(BLOCK_COLORS.text).toContain("--cms-color-text");
    expect(BLOCK_COLORS.primary).toContain("--cms-color-primary");
    expect(BLOCK_FONTS.heading).toContain("--cms-font-heading");
    expect(BLOCK_FONTS.body).toContain("--cms-font-body");
  });

  it("derives the vertical section rhythm from the spaceSection token", () => {
    const expected = "var(--cms-space-section, " + DEFAULT_APPEARANCE_TOKENS.spaceSection + ")";
    expect(BLOCK_SECTION_PADDING.paddingTop).toBe(expected);
    expect(BLOCK_SECTION_PADDING.paddingBottom).toBe(expected);
  });

  it("honours a colour override only when it names a declared token", () => {
    const fallback = "var(--cms-color-surface, #ffffff)";
    expect(resolveColorToken("colorPrimary", fallback)).toBe(
      "var(--cms-color-primary, " + DEFAULT_APPEARANCE_TOKENS.colorPrimary + ")"
    );
    expect(resolveColorToken("#123abc", fallback)).toBe(fallback);
    expect(resolveColorToken("brand", fallback)).toBe(fallback);
    expect(resolveColorToken("fontHeading", fallback)).toBe(fallback);
    expect(resolveColorToken(undefined, fallback)).toBe(fallback);
    expect(optionalColorToken("#123abc")).toBeUndefined();
    expect(optionalColorToken("colorBorder")).toBe(
      "var(--cms-color-border, " + DEFAULT_APPEARANCE_TOKENS.colorBorder + ")"
    );
  });
});

describe("Default appearance palette accessibility", () => {
  it("keeps body, muted and primary text at WCAG AA on the site background", () => {
    const tokens = DEFAULT_APPEARANCE_TOKENS;
    expect(contrastRatio(tokens.colorText, tokens.colorBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colorTextMuted, tokens.colorBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colorPrimary, tokens.colorBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps primary-button text at WCAG AA on the primary colour", () => {
    const tokens = DEFAULT_APPEARANCE_TOKENS;
    expect(
      contrastRatio(tokens.colorPrimaryContrast, tokens.colorPrimary)
    ).toBeGreaterThanOrEqual(4.5);
  });
});
