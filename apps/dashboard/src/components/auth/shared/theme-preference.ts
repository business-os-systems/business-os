/**
 * Canonical theme preference values and the storage key used after sign-in.
 * Validating the server value keeps an arbitrary attribute off the document
 * root and removes the magic strings from the login flow (P3/P5).
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "business_os_theme";

export function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}
