import { isLengthToken } from "./tokens.js";

export { isLengthToken };

/**
 * The declared steps a theme may choose from (FR-074). The catalog form, the
 * style board and any later tenant panel read these tables, so a step can never
 * exist in one screen and not the other.
 */

export const SCALE_IDS = ["type-size", "radius", "spacing"] as const;
export type ScaleId = (typeof SCALE_IDS)[number];

export const SCALE_STEPS: Readonly<Record<ScaleId, readonly string[]>> = {
  "type-size": [
    "0.75rem",
    "0.875rem",
    "1rem",
    "1.125rem",
    "1.25rem",
    "1.5rem",
    "1.75rem",
    "2rem",
    "2.25rem",
    "2.5rem",
    "3rem",
    "3.5rem",
    "3.75rem",
    "4rem",
  ],
  radius: ["0", "0.25rem", "0.375rem", "0.5rem", "0.625rem", "0.75rem", "1rem", "1.25rem", "1.5rem"],
  spacing: ["1.5rem", "2rem", "2.5rem", "3rem", "3.5rem", "4rem", "4.5rem", "5rem", "6rem"],
};

export function isScaleStep(id: ScaleId, value: string): boolean {
  return SCALE_STEPS[id].includes(value.trim());
}

const ROOT_FONT_PX = 16;

export const LENGTH_UNITS = ["rem", "px", "em"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export interface SplitLength {
  readonly amount: string;
  readonly unit: LengthUnit;
}

/** Splits a stored length so the Custom control can show a number and its unit. */
export function splitLength(value: string): SplitLength | null {
  const trimmed = value.trim();
  const unit = LENGTH_UNITS.find((candidate) => trimmed.endsWith(candidate));
  if (unit === undefined) {
    return null;
  }
  return { amount: trimmed.slice(0, -unit.length), unit };
}

/** Rebuilds the stored string from the number and unit the operator chose. */
export function joinLength(amount: string, unit: LengthUnit): string {
  return amount.trim() + unit;
}

/** Adds the pixel equivalent for rem values so an operator sees both units. */
export function lengthLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.endsWith("rem")) {
    return value;
  }
  const rem = Number.parseFloat(trimmed);
  if (!Number.isFinite(rem)) {
    return value;
  }
  const px = Math.round(rem * ROOT_FONT_PX * 100) / 100;
  return `${value} · ${px}px`;
}

