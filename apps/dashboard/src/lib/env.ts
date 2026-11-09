/**
 * Centralized Environment Configuration Helper (@suite/dashboard)
 * Single source of truth for runtime environment detection and configuration.
 */

import { isTemplateSecret } from "@suite/core";

const NODE_ENV = process.env.NODE_ENV;
export const isProduction = NODE_ENV === "production";
export const isDevelopment = NODE_ENV === "development";
export const isTest = NODE_ENV === "test";
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
  if (getNodeEnv() === "production" && isTemplateSecret(secret)) {
    throw new Error(
      "BETTER_AUTH_SECRET still holds a published template value. Generate a real secret before starting in production."
    );
  }
  return secret;
}

/**
 * Base URL of the Platform API. NEXT_PUBLIC_API_URL is pre-declared in the env
 * templates; there is no inline fallback, so a missing value fails loudly
 * instead of silently calling a developer machine (P14).
 */
export function getPublicApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL environment variable must be pre-declared in .env"
    );
  }
  return url.replace(/\/$/, "");
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

/**
 * Server-side API origin for tenant-plane reads that must go through the API
 * rather than a local Prisma client (for example the audited support-session
 * read, which app_tenant cannot perform directly).
 */
export function getApiServerUrl(): string {
  const value = process.env.API_URL;
  if (!value) {
    throw new Error("API_URL environment variable must be pre-declared in .env");
  }
  return value.replace(/\/+$/, "");
}

/**
 * Support address shown on a suspended or archived workspace notice (FR-022).
 * Optional on purpose: a deployment without it shows the administrator
 * instruction instead of a dead mail link, and no address is invented.
 */
export function getSupportContactEmail(): string | null {
  const value = process.env.SUPPORT_CONTACT_EMAIL?.trim();
  return value && value.length > 0 ? value : null;
}

export function getBuildTimestamp(): string {
  const ts = process.env.BUILD_TIMESTAMP;
  if (!ts) {
    throw new Error("BUILD_TIMESTAMP environment variable must be pre-declared in .env");
  }
  return ts;
}
