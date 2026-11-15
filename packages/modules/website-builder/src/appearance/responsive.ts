import {
  APPEARANCE_CSS_VAR_BY_TOKEN,
  DEFAULT_APPEARANCE_TOKENS,
  TEXT_SIZE_ROLE_KEYS,
  type TextSizeRoleKey,
} from "./tokens.js";

/**
 * How one stored size becomes a responsive one (FR-016, FR-084).
 *
 * Blocks read a rendered variable, so they never branch on width, and the
 * panel stores one value per role. The shares are per role because that is what
 * today's blocks do - the hero steps 0.6 / 0.8 / 1 while a heading steps
 * 0.833 / 1 / 1 - so no single shared ratio could keep every live site intact.
 */

/** Each role resolves to a rendered variable so blocks never branch on width. */
const RENDERED_VAR_BY_ROLE = {
  textHeroSize: "--cms-text-hero-rendered",
  textHeadingSize: "--cms-text-heading-rendered",
  textBodySize: "--cms-text-body-rendered",
  textSmallSize: "--cms-text-small-rendered",
} as const satisfies Record<TextSizeRoleKey, `--cms-text-${string}`>;

/**
 * One stored value per role, rendered responsively by a share of it (FR-016).
 * The shares differ per role because that is what today's blocks actually do:
 * the hero steps 0.6 / 0.8 / 1 and a section heading steps 0.8333 / 1 / 1, so a
 * single shared ratio could not reproduce both without changing a live site.
 */
const NARROW_MAX_WIDTH_PX = 639;
const MEDIUM_MIN_WIDTH_PX = 640;
const MEDIUM_MAX_WIDTH_PX = 1023;
const WIDE_MIN_WIDTH_PX = 1024;

/** Never let a derived size fall below a readable floor (FR-084). */
const MIN_SIZE = "0.75rem";

const HERO_NARROW_SHARE = 0.6;
const HERO_MEDIUM_SHARE = 0.8;
/** 1.875rem on a phone against 2.25rem on a desktop, the heading steps today. */
const HEADING_NARROW_SHARE = 1.875 / 2.25;

export const SIZE_FACTORS = {
  textHeroSize: { narrow: HERO_NARROW_SHARE, medium: HERO_MEDIUM_SHARE },
  textHeadingSize: { narrow: HEADING_NARROW_SHARE, medium: 1 },
  textBodySize: { narrow: 1, medium: 1 },
  textSmallSize: { narrow: 1, medium: 1 },
} as const satisfies Record<TextSizeRoleKey, { narrow: number; medium: number }>;

type SizeFactorKey = "base" | "narrow" | "medium";

function roleRule(key: TextSizeRoleKey, step: SizeFactorKey): string {
  const stored = `var(${APPEARANCE_CSS_VAR_BY_TOKEN[key]}, ${DEFAULT_APPEARANCE_TOKENS[key]})`;
  const factor = step === "base" ? 1 : SIZE_FACTORS[key][step];
  const value =
    factor === 1 ? stored : `clamp(${MIN_SIZE}, calc(${stored} * ${factor}), ${stored})`;
  return `${RENDERED_VAR_BY_ROLE[key]}: ${value}`;
}

function rulesFor(step: SizeFactorKey): string {
  return TEXT_SIZE_ROLE_KEYS.map((key) => roleRule(key, step)).join("; ");
}

/**
 * The breakpoint rules that turn one stored size into a responsive one. Values
 * are `calc()` over the stored variable, so any unit the contract accepts keeps
 * working and no second field is ever stored.
 */
export function responsiveTextRoleStyles(): string {
  const base = `[data-cms-theme]{${rulesFor("base")}}`;
  const narrow = `@media (max-width:${NARROW_MAX_WIDTH_PX}px){[data-cms-theme]{${rulesFor("narrow")}}}`;
  const medium = `@media (min-width:${MEDIUM_MIN_WIDTH_PX}px) and (max-width:${MEDIUM_MAX_WIDTH_PX}px){[data-cms-theme]{${rulesFor("medium")}}}`;
  const wide = `@media (min-width:${WIDE_MIN_WIDTH_PX}px){[data-cms-theme]{${rulesFor("base")}}}`;
  return base + narrow + medium + wide;
}
