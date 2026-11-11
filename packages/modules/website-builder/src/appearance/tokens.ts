/**
 * The canonical appearance token contract for a tenant site (FR-150..FR-157).
 *
 * A site never reads a platform theme at render time: every site stores its own
 * complete snapshot of these tokens. The defaults below are the canonical
 * fallback design (DESIGN.md light palette) used when a site is created, when a
 * selected theme omits a token, or when a token introduced after the site was
 * created is read for the first time (FR-155).
 *
 * The module is deliberately free of React and database imports so the API, the
 * renderer and the dashboard can all share one contract.
 */
import { z } from "zod";

export const APPEARANCE_TOKEN_KEYS = [
  "colorBackground",
  "colorSurface",
  "colorText",
  "colorTextMuted",
  "colorPrimary",
  "colorPrimaryContrast",
  "colorAccent",
  "colorBorder",
  "fontHeading",
  "fontBody",
  "radiusSm",
  "radiusMd",
  "radiusLg",
  "shadowCard",
  "spaceSection",
] as const;

export type AppearanceTokenKey = (typeof APPEARANCE_TOKEN_KEYS)[number];

export type AppearanceTokens = Readonly<Record<AppearanceTokenKey, string>>;

/** A mutable partial edit accepted from the appearance panel. */
export type AppearanceTokenPatch = {
  -readonly [Key in keyof AppearanceTokens]?: AppearanceTokens[Key];
};

const COLOUR_TOKEN = /^#[0-9a-fA-F]{6}$/;
const FONT_TOKEN = /^[A-Za-z0-9 ,-]+$/;
const SHADOW_TOKEN = /^[A-Za-z0-9 .,%()#-]+$/;
const LENGTH_UNITS = ["px", "rem", "em"] as const;

function isDecimalDigits(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  return [...value].every((character) => character >= "0" && character <= "9");
}

/** Validates 0, 12px, 0.75rem and similar bounded CSS lengths without a regex. */
function isLengthToken(value: string): boolean {
  if (value === "0") {
    return true;
  }
  const unit = LENGTH_UNITS.find((candidate) => value.endsWith(candidate));
  if (unit === undefined) {
    return false;
  }
  const numeric = value.slice(0, -unit.length);
  const parts = numeric.split(".");
  if (parts.length > 2) {
    return false;
  }
  return parts.every(isDecimalDigits);
}

const colourTokenSchema = z
  .string()
  .trim()
  .regex(COLOUR_TOKEN, "Use a six-digit hex colour.");
const fontTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(FONT_TOKEN, "Use a font family list: letters, digits, spaces, commas or hyphens.");
const lengthTokenSchema = z
  .string()
  .trim()
  .refine(isLengthToken, "Use a length in px, rem or em.");
const shadowTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(SHADOW_TOKEN, "Use a CSS box-shadow value.");

const APPEARANCE_TOKEN_SHAPES = {
  colorBackground: colourTokenSchema,
  colorSurface: colourTokenSchema,
  colorText: colourTokenSchema,
  colorTextMuted: colourTokenSchema,
  colorPrimary: colourTokenSchema,
  colorPrimaryContrast: colourTokenSchema,
  colorAccent: colourTokenSchema,
  colorBorder: colourTokenSchema,
  fontHeading: fontTokenSchema,
  fontBody: fontTokenSchema,
  radiusSm: lengthTokenSchema,
  radiusMd: lengthTokenSchema,
  radiusLg: lengthTokenSchema,
  shadowCard: shadowTokenSchema,
  spaceSection: lengthTokenSchema,
} as const;

/** A complete snapshot: every declared token is present and valid. */
export const AppearanceTokensSchema = z.object(APPEARANCE_TOKEN_SHAPES).strict();

/** A partial edit from the appearance panel; unknown keys are rejected. */
export const AppearanceTokenPatchSchema = AppearanceTokensSchema.partial();

/** A catalog theme may omit tokens (FR-155); unknown future tokens are ignored. */
export const ThemeAppearanceTokensSchema = z.object(APPEARANCE_TOKEN_SHAPES).partial();

export const DEFAULT_APPEARANCE_TOKENS: AppearanceTokens = {
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
  radiusSm: "0.375rem",
  radiusMd: "0.5rem",
  radiusLg: "0.75rem",
  shadowCard: "0 1px 2px rgba(30, 27, 25, 0.08)",
  spaceSection: "4rem",
};

/** The CSS custom property each token is exposed as by the ThemeProvider. */
export const APPEARANCE_CSS_VAR_BY_TOKEN = {
  colorBackground: "--cms-color-background",
  colorSurface: "--cms-color-surface",
  colorText: "--cms-color-text",
  colorTextMuted: "--cms-color-text-muted",
  colorPrimary: "--cms-color-primary",
  colorPrimaryContrast: "--cms-color-primary-contrast",
  colorAccent: "--cms-color-accent",
  colorBorder: "--cms-color-border",
  fontHeading: "--cms-font-heading",
  fontBody: "--cms-font-body",
  radiusSm: "--cms-radius-sm",
  radiusMd: "--cms-radius-md",
  radiusLg: "--cms-radius-lg",
  shadowCard: "--cms-shadow-card",
  spaceSection: "--cms-space-section",
} as const satisfies Record<AppearanceTokenKey, `--cms-${string}`>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickStoredToken(
  key: AppearanceTokenKey,
  source: Record<string, unknown>
): string {
  const raw = source[key];
  if (typeof raw !== "string") {
    return DEFAULT_APPEARANCE_TOKENS[key];
  }
  const parsed = APPEARANCE_TOKEN_SHAPES[key].safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE_TOKENS[key];
}

/**
 * Fills missing or legacy-invalid tokens with the canonical defaults without
 * rewriting the stored row, so a token added later never breaks an old site
 * (FR-155) and never changes it silently.
 */
export function normalizeAppearanceTokens(value: unknown): AppearanceTokens {
  const source = isRecord(value) ? value : {};
  return {
    colorBackground: pickStoredToken("colorBackground", source),
    colorSurface: pickStoredToken("colorSurface", source),
    colorText: pickStoredToken("colorText", source),
    colorTextMuted: pickStoredToken("colorTextMuted", source),
    colorPrimary: pickStoredToken("colorPrimary", source),
    colorPrimaryContrast: pickStoredToken("colorPrimaryContrast", source),
    colorAccent: pickStoredToken("colorAccent", source),
    colorBorder: pickStoredToken("colorBorder", source),
    fontHeading: pickStoredToken("fontHeading", source),
    fontBody: pickStoredToken("fontBody", source),
    radiusSm: pickStoredToken("radiusSm", source),
    radiusMd: pickStoredToken("radiusMd", source),
    radiusLg: pickStoredToken("radiusLg", source),
    shadowCard: pickStoredToken("shadowCard", source),
    spaceSection: pickStoredToken("spaceSection", source),
  };
}

/**
 * Copies a published catalog theme's tokens into a complete site snapshot.
 * Missing tokens receive the defaults; a malformed declared token is a
 * validation error instead of a silent restyle.
 */
export function appearanceTokensFromTheme(raw: unknown): AppearanceTokens {
  const parsed = ThemeAppearanceTokensSchema.safeParse(raw);
  if (!parsed.success) {
    throw parsed.error;
  }
  return AppearanceTokensSchema.parse({
    ...DEFAULT_APPEARANCE_TOKENS,
    ...parsed.data,
  });
}

/** Maps a complete snapshot to the CSS custom properties the renderer uses. */
export function appearanceCssVariables(tokens: AppearanceTokens): Record<string, string> {
  return {
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorBackground]: tokens.colorBackground,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorSurface]: tokens.colorSurface,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorText]: tokens.colorText,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorTextMuted]: tokens.colorTextMuted,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorPrimary]: tokens.colorPrimary,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorPrimaryContrast]: tokens.colorPrimaryContrast,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorAccent]: tokens.colorAccent,
    [APPEARANCE_CSS_VAR_BY_TOKEN.colorBorder]: tokens.colorBorder,
    [APPEARANCE_CSS_VAR_BY_TOKEN.fontHeading]: tokens.fontHeading,
    [APPEARANCE_CSS_VAR_BY_TOKEN.fontBody]: tokens.fontBody,
    [APPEARANCE_CSS_VAR_BY_TOKEN.radiusSm]: tokens.radiusSm,
    [APPEARANCE_CSS_VAR_BY_TOKEN.radiusMd]: tokens.radiusMd,
    [APPEARANCE_CSS_VAR_BY_TOKEN.radiusLg]: tokens.radiusLg,
    [APPEARANCE_CSS_VAR_BY_TOKEN.shadowCard]: tokens.shadowCard,
    [APPEARANCE_CSS_VAR_BY_TOKEN.spaceSection]: tokens.spaceSection,
  };
}
