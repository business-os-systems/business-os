/**
 * Centralized Environment Configuration Helper (@suite/api)
 * Single source of truth for runtime environment detection and configuration.
 */

import { isTemplateSecret } from "@suite/core";

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Edge admission is mandatory in production and can be switched on locally
 * with EDGE_ADMISSION_ENFORCED=true. When enforced, the API verifies the
 * Cloudflare Access assertion itself instead of trusting the proxy hop.
 */
export function isEdgeAdmissionEnforced(): boolean {
  return isProduction || process.env.EDGE_ADMISSION_ENFORCED === "true";
}
export const isDevelopment = process.env.NODE_ENV === "development";
export const isTest = process.env.NODE_ENV === "test";

/** Reads a required variable or fails before the feature can serve a request. */
function requireEnvValue(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable must be pre-declared in .env`);
  }
  return value;
}

export function getNodeEnv(): string {
  return requireEnvValue("NODE_ENV");
}

export function getAppVersion(): string {
  return requireEnvValue("APP_VERSION");
}

export function getGitCommitSha(): string {
  return requireEnvValue("GIT_COMMIT_SHA");
}

export function getBuildTimestamp(): string {
  return requireEnvValue("BUILD_TIMESTAMP");
}

/** Session and manager-override HMAC key; the API cannot sign without it. */
export function getBetterAuthSecret(): string {
  return requireEnvValue("BETTER_AUTH_SECRET");
}

/** Absolute dashboard origin used for login and verification redirects. */
export function getDashboardUrl(): string {
  return requireEnvValue("DASHBOARD_URL").replace(/\/$/, "");
}

/** Static bearer token accepted by the telemetry guard alongside a session. */
export function getMetricsAuthToken(): string {
  return requireEnvValue("METRICS_AUTH_TOKEN");
}

/** The API port; validated as a real TCP port instead of NaN at bind time. */
export function getServerPort(): number {
  const raw = requireEnvValue("PORT");
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535; received "${raw}".`
    );
  }
  return port;
}

/** Empty means crash reporting is deliberately disabled (see .env.example). */
export function getSentryDsn(): string | null {
  const value = process.env.SENTRY_DSN;
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return value;
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

/** The explicit cross-origin whitelist; empty means no browser origin is allowed. */
export function getCorsAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env
): readonly string[] {
  return (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** The Platform console origin, or null when the console is not deployed. */
export function getControlPlaneOrigin(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const value = env.CONTROL_PLANE_ORIGIN?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

export function isInternalDocsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.ENABLE_INTERNAL_DOCS === "true";
}

/** Absolute API URL for the OpenAPI server list, or the mounted relative root. */
export function getPublicApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.API_URL?.trim();
  return value === undefined || value.length === 0 ? "/" : value;
}

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
