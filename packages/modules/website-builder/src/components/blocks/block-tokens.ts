/**
 * The presentation contract every section block shares (FR-153, FR-100).
 *
 * A block may only emit a value that resolves from the site's appearance
 * snapshot. Published pages mount the ThemeProvider, so each `--cms-*`
 * variable below wins. The fallback keeps the studio canvas and the catalog
 * preview legible while they render without a site snapshot.
 *
 * Operator-authored style overrides survive only when they name a declared
 * appearance token (for example `styles.backgroundColor = "colorPrimary"`).
 * Legacy literal colour and pixel spacing values stay in stored pages but are
 * never rendered, so a site's tokens always control its published output.
 */
import type { CSSProperties } from "react";
import {
  APPEARANCE_COLOR_TOKEN_KEYS,
  APPEARANCE_CSS_VAR_BY_TOKEN,
  DEFAULT_APPEARANCE_TOKENS,
  type AppearanceTokenKey,
} from "../../appearance/index.js";
import type { BlockStyleTokens } from "../../ast/types.js";

type ColorTokenKey = (typeof APPEARANCE_COLOR_TOKEN_KEYS)[number];

type BlockCssVariables = CSSProperties & Record<`--${string}`, string>;

function tokenWithDefault(key: AppearanceTokenKey): string {
  return `var(${APPEARANCE_CSS_VAR_BY_TOKEN[key]}, ${DEFAULT_APPEARANCE_TOKENS[key]})`;
}

function tokenWithPlatformFallback(
  key: AppearanceTokenKey,
  platformToken: `--bos-${string}`
): string {
  return `var(${APPEARANCE_CSS_VAR_BY_TOKEN[key]}, var(${platformToken}))`;
}

/** Site colours; the platform semantic token applies only without a snapshot. */
export const BLOCK_COLORS = {
  background: tokenWithPlatformFallback("colorBackground", "--bos-bg"),
  surface: tokenWithPlatformFallback("colorSurface", "--bos-surface"),
  text: tokenWithPlatformFallback("colorText", "--bos-text"),
  textMuted: tokenWithPlatformFallback("colorTextMuted", "--bos-text-secondary"),
  primary: tokenWithPlatformFallback("colorPrimary", "--bos-brand"),
  primaryContrast: tokenWithPlatformFallback("colorPrimaryContrast", "--bos-on-brand"),
  accent: tokenWithPlatformFallback("colorAccent", "--bos-action"),
  border: tokenWithPlatformFallback("colorBorder", "--bos-border"),
} as const;

/** Site fonts; the platform pair applies only without a snapshot. */
export const BLOCK_FONTS = {
  heading: tokenWithPlatformFallback("fontHeading", "--bos-font-heading"),
  body: tokenWithPlatformFallback("fontBody", "--bos-font-sans"),
} as const;

/** The single vertical rhythm every section consumes (FR-153). */
export const BLOCK_SECTION_PADDING: CSSProperties = {
  paddingTop: tokenWithDefault("spaceSection"),
  paddingBottom: tokenWithDefault("spaceSection"),
};

/** Site radii; the canonical defaults apply only without a snapshot. */
export const BLOCK_RADII = {
  sm: tokenWithDefault("radiusSm"),
  md: tokenWithDefault("radiusMd"),
  lg: tokenWithDefault("radiusLg"),
} as const;

export const BLOCK_CARD_SHADOW = tokenWithDefault("shadowCard");

function isColorTokenKey(value: string): value is ColorTokenKey {
  return APPEARANCE_COLOR_TOKEN_KEYS.some((key) => key === value);
}

/** Resolves a stored colour override; a non-token value renders nothing. */
export function optionalColorToken(value: string | undefined): string | undefined {
  if (value === undefined || !isColorTokenKey(value)) {
    return undefined;
  }
  return tokenWithDefault(value);
}

export function resolveColorToken(value: string | undefined, fallback: string): string {
  return optionalColorToken(value) ?? fallback;
}

export interface BlockSurfaceDefaults {
  readonly background: string;
  readonly text: string;
  readonly border: string;
}

/** Applies the site surface, text and hairline to a block root. */
export function resolveBlockSurface(
  styles: BlockStyleTokens | undefined,
  defaults: BlockSurfaceDefaults
): CSSProperties {
  return {
    backgroundColor: resolveColorToken(styles?.backgroundColor, defaults.background),
    color: resolveColorToken(styles?.textColor, defaults.text),
    borderColor: resolveColorToken(styles?.borderColor, defaults.border),
  };
}

const SECTION_SURFACE_DEFAULTS: BlockSurfaceDefaults = {
  background: BLOCK_COLORS.background,
  text: BLOCK_COLORS.text,
  border: BLOCK_COLORS.border,
};

/** Applies the shared section surface and the single vertical rhythm. */
export function resolveSectionStyle(styles: BlockStyleTokens | undefined): CSSProperties {
  return {
    ...resolveBlockSurface(styles, SECTION_SURFACE_DEFAULTS),
    ...BLOCK_SECTION_PADDING,
    fontFamily: BLOCK_FONTS.body,
  };
}

/** Typography inside sanitized rich text, mapped to the same site tokens. */
export const BLOCK_PROSE_VARIABLES: BlockCssVariables = {
  "--tw-prose-body": BLOCK_COLORS.textMuted,
  "--tw-prose-headings": BLOCK_COLORS.text,
  "--tw-prose-lead": BLOCK_COLORS.textMuted,
  "--tw-prose-links": BLOCK_COLORS.primary,
  "--tw-prose-bold": BLOCK_COLORS.text,
  "--tw-prose-counters": BLOCK_COLORS.textMuted,
  "--tw-prose-bullets": BLOCK_COLORS.border,
  "--tw-prose-hr": BLOCK_COLORS.border,
  "--tw-prose-quotes": BLOCK_COLORS.textMuted,
  "--tw-prose-quote-borders": BLOCK_COLORS.border,
  "--tw-prose-captions": BLOCK_COLORS.textMuted,
  "--tw-prose-code": BLOCK_COLORS.text,
  "--tw-prose-kbd": BLOCK_COLORS.text,
  "--tw-prose-backticks": BLOCK_COLORS.textMuted,
  "--tw-prose-pre-code": BLOCK_COLORS.text,
  "--tw-prose-pre-bg": BLOCK_COLORS.surface,
  "--tw-prose-th-borders": BLOCK_COLORS.border,
  "--tw-prose-td-borders": BLOCK_COLORS.border,
};
