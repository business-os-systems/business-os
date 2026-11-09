import { isBrowser } from "@/lib/env";
import {
  isThemePreference,
  THEME_STORAGE_KEY,
} from "@/components/auth/shared/theme-preference";

const AUTH_QUERY_KEYS = ["error", "notice", "org", "domain", "provider"] as const;
const STATUS_QUERY_KEYS = ["error", "notice"] as const;
const REDIRECT_QUERY_KEY = "redirect";

function toSearchSuffix(query: string): string {
  return query.length > 0 ? "?" + query : "";
}

/**
 * Removes the one-shot auth status parameters from the address bar after the
 * user dismisses the banner, leaving unrelated query state untouched.
 */
export function clearLoginQueryParams(): void {
  if (!isBrowser) return;

  const url = new URL(window.location.href);
  const hasStatus = STATUS_QUERY_KEYS.some((key) => url.searchParams.has(key));
  if (!hasStatus) return;

  for (const key of AUTH_QUERY_KEYS) {
    url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  window.history.replaceState({}, "", url.pathname + toSearchSuffix(query));
}

/** Reads the optional post-login redirect parameter from the address bar. */
export function readRedirectParam(): string | null {
  if (!isBrowser) return null;
  return new URLSearchParams(window.location.search).get(REDIRECT_QUERY_KEY);
}

/**
 * Applies the server-provided theme preference before navigation. Storage is
 * best-effort; a denied localStorage write is reported, never swallowed.
 */
export function applyThemePreference(themePreference?: string): void {
  if (!themePreference || !isBrowser) return;
  if (!isThemePreference(themePreference)) return;

  document.documentElement.setAttribute("data-theme", themePreference);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  } catch (error) {
    console.warn("[Login] Unable to persist the theme preference.", error);
  }
}
