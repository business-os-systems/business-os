/**
 * Returns the first non-empty string in declaration order, or null.
 * Used by the auth pages where the previous code relied on truthiness chains
 * (a || b || fallback) that hid empty-string drift (P3/P5).
 */
export function firstNonEmpty(
  ...values: readonly (string | null | undefined)[]
): string | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value.length > 0) {
      return value;
    }
  }
  return null;
}
