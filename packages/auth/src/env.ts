/**
 * Centralized Environment Configuration Helper (@suite/auth)
 * Single source of truth for runtime environment detection and configuration.
 */

export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
export const isTest = process.env.NODE_ENV === "test";

/**
 * Returns the platform Better-Auth secret from environment variables.
 * Enforces BETTER_AUTH_SECRET uniformly across all environments without static fallbacks.
 */
export function getBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET environment variable is required to sign and verify session tokens."
    );
  }
  return secret;
}


export type SessionCookieSameSite = "strict" | "lax" | "none";

/**
 * Shared SameSite policy for authentication cookies across every app.
 * Defaults to strict; set SESSION_COOKIE_SAME_SITE=none only for a
 * genuinely cross-site control-plane deployment over HTTPS.
 */
export function getSessionCookieSameSite(): SessionCookieSameSite {
  const raw = process.env.SESSION_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return "strict";
  if (raw === "strict" || raw === "lax" || raw === "none") return raw;
  throw new Error(
    "SESSION_COOKIE_SAME_SITE must be one of: strict, lax, none"
  );
}
