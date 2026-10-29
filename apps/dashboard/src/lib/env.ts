/**
 * Centralized Environment Configuration Helper (@suite/dashboard)
 * Single source of truth for runtime environment detection and configuration.
 */

export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
export const isTest = process.env.NODE_ENV === "test";
export const isBrowser = typeof window !== "undefined";
export const isServer = !isBrowser;

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

export function getNodeEnv(): string {
  const env = process.env.NODE_ENV;
  if (!env) {
    throw new Error("NODE_ENV environment variable must be pre-declared in .env");
  }
  return env;
}

export function getAppVersion(): string {
  const version = process.env.APP_VERSION;
  if (!version) {
    throw new Error("APP_VERSION environment variable must be pre-declared in .env");
  }
  return version;
}

export function getGitCommitSha(): string {
  const sha = process.env.GIT_COMMIT_SHA;
  if (!sha) {
    throw new Error("GIT_COMMIT_SHA environment variable must be pre-declared in .env");
  }
  return sha;
}

export function getBuildTimestamp(): string {
  const ts = process.env.BUILD_TIMESTAMP;
  if (!ts) {
    throw new Error("BUILD_TIMESTAMP environment variable must be pre-declared in .env");
  }
  return ts;
}
