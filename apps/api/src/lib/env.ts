/**
 * Centralized Environment Configuration Helper (@suite/api)
 * Single source of truth for runtime environment detection and configuration.
 */

import { isTemplateSecret } from "@suite/core";

export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";
export const isTest = process.env.NODE_ENV === "test";

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

const PRODUCTION_SECRET_NAMES = [
  "BETTER_AUTH_SECRET",
  "METRICS_AUTH_TOKEN",
  "GDPR_HMAC_SALT_KEY",
  "CONTROL_SESSION_SECRET",
  "TURNSTILE_SECRET_KEY",
] as const;

/** Secrets the API cannot serve correctly without a real value. */
const MANDATORY_PRODUCTION_SECRETS = [
  "BETTER_AUTH_SECRET",
  "CONTROL_SESSION_SECRET",
  "GDPR_HMAC_SALT_KEY",
] as const;

export function getTrustedProxyIps(
  env: NodeJS.ProcessEnv = process.env
): readonly string[] {
  return (env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/**
 * Fails closed before the server binds a port. An empty proxy list makes every
 * client behind the reverse proxy share one rate-limit bucket, and a template
 * secret means the deployment is using keys that are public in the repository.
 */
export function assertProductionConfiguration(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  for (const name of MANDATORY_PRODUCTION_SECRETS) {
    const value = env[name]?.trim();
    if (value === undefined || value.length === 0) {
      throw new Error(
        `${name} must hold a generated secret in production; it is unset or empty.`
      );
    }
  }

  for (const name of PRODUCTION_SECRET_NAMES) {
    const value = env[name]?.trim();
    if (value !== undefined && isTemplateSecret(value)) {
      throw new Error(
        `${name} still holds a published template value. Generate a real secret before starting in production.`
      );
    }
  }

  if (getTrustedProxyIps(env).length === 0) {
    throw new Error(
      "TRUSTED_PROXY_IPS must list the reverse-proxy addresses in production. An empty list collapses every client into one rate-limit bucket."
    );
  }
}
