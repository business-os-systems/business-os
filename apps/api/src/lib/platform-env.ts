/**
 * Platform control-plane environment configuration.
 *
 * Every variable is pre-declared in `.env.example`. Missing or malformed values
 * fail loudly; there are no inline fallbacks and no server-local defaults.
 */

export const PLATFORM_ENV_KEYS = {
  CONTROL_PLANE_ORIGIN: "CONTROL_PLANE_ORIGIN",
  CONTROL_WEBAUTHN_RP_ID: "CONTROL_WEBAUTHN_RP_ID",
  CONTROL_SESSION_SECRET: "CONTROL_SESSION_SECRET",
  PLATFORM_DATABASE_URL: "PLATFORM_DATABASE_URL",
  EDGE_TEAM_DOMAIN: "EDGE_TEAM_DOMAIN",
  EDGE_AUDIENCE: "EDGE_AUDIENCE",
  IMPERSONATION_MAX_MINUTES: "IMPERSONATION_MAX_MINUTES",
  QUOTA_CACHE_TTL_SECONDS: "QUOTA_CACHE_TTL_SECONDS",
  CATALOG_CACHE_TTL_SECONDS: "CATALOG_CACHE_TTL_SECONDS",
  PLATFORM_BOOTSTRAP_OPERATOR_EMAIL: "PLATFORM_BOOTSTRAP_OPERATOR_EMAIL",
} as const;

export type PlatformEnvKey =
  (typeof PLATFORM_ENV_KEYS)[keyof typeof PLATFORM_ENV_KEYS];

const MINIMUM_SECRET_LENGTH = 32;
const KNOWN_INSECURE_CONTROL_SECRETS = new Set([
  "platform-control-session-signing-secret-32ch-min",
]);
const MAXIMUM_TTL_SECONDS = 3600;
const MAXIMUM_IMPERSONATION_MINUTES = 1440;

function readRequired(key: PlatformEnvKey): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} environment variable must be pre-declared in .env`);
  }
  return value.trim();
}

function readPositiveInteger(
  key: PlatformEnvKey,
  maximum: number
): number {
  const raw = readRequired(key);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${key} must be a positive integer, received "${raw}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1 || value > maximum) {
    throw new Error(`${key} must be between 1 and ${maximum}, received ${value}`);
  }
  return value;
}

function readHttpUrl(key: PlatformEnvKey): string {
  const raw = readRequired(key);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`${key} must be an absolute URL, received "${raw}"`, {
      cause: error,
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} must use http or https, received "${parsed.protocol}"`);
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error(`${key} must use https in production`);
  }
  return parsed.origin;
}

function readPostgresUrl(key: PlatformEnvKey): string {
  const raw = readRequired(key);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`${key} must be a PostgreSQL connection URL`, {
      cause: error,
    });
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${key} must use postgresql:// or postgres://`);
  }
  return raw;
}

export function getControlPlaneOrigin(): string {
  return readHttpUrl(PLATFORM_ENV_KEYS.CONTROL_PLANE_ORIGIN);
}

export function getControlWebauthnRpId(): string {
  return readRequired(PLATFORM_ENV_KEYS.CONTROL_WEBAUTHN_RP_ID);
}

export function getControlSessionSecret(): string {
  const secret = readRequired(PLATFORM_ENV_KEYS.CONTROL_SESSION_SECRET);
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `${PLATFORM_ENV_KEYS.CONTROL_SESSION_SECRET} must be at least ${MINIMUM_SECRET_LENGTH} characters`
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    KNOWN_INSECURE_CONTROL_SECRETS.has(secret)
  ) {
    throw new Error(
      `${PLATFORM_ENV_KEYS.CONTROL_SESSION_SECRET} must not use the shipped example value`
    );
  }
  return secret;
}

export function getPlatformDatabaseUrl(): string {
  return readPostgresUrl(PLATFORM_ENV_KEYS.PLATFORM_DATABASE_URL);
}

/**
 * The tenant API must keep serving when the platform plane is not configured
 * (SC-011), so the outbox worker asks before it connects rather than failing
 * the boot. A configured-but-invalid URL still fails loudly in the getter.
 */
export function isPlatformPlaneConfigured(): boolean {
  const value = process.env[PLATFORM_ENV_KEYS.PLATFORM_DATABASE_URL];
  return value !== undefined && value.trim() !== "";
}

export function getEdgeTeamDomain(): string {
  return readRequired(PLATFORM_ENV_KEYS.EDGE_TEAM_DOMAIN);
}

export function getEdgeAudience(): string {
  return readRequired(PLATFORM_ENV_KEYS.EDGE_AUDIENCE);
}

export function getImpersonationMaxMinutes(): number {
  return readPositiveInteger(
    PLATFORM_ENV_KEYS.IMPERSONATION_MAX_MINUTES,
    MAXIMUM_IMPERSONATION_MINUTES
  );
}

export function getQuotaCacheTtlSeconds(): number {
  return readPositiveInteger(
    PLATFORM_ENV_KEYS.QUOTA_CACHE_TTL_SECONDS,
    MAXIMUM_TTL_SECONDS
  );
}

export function getCatalogCacheTtlSeconds(): number {
  return readPositiveInteger(
    PLATFORM_ENV_KEYS.CATALOG_CACHE_TTL_SECONDS,
    MAXIMUM_TTL_SECONDS
  );
}

export function getPlatformBootstrapOperatorEmail(): string {
  const email = readRequired(PLATFORM_ENV_KEYS.PLATFORM_BOOTSTRAP_OPERATOR_EMAIL);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      `${PLATFORM_ENV_KEYS.PLATFORM_BOOTSTRAP_OPERATOR_EMAIL} must be a valid email address`
    );
  }
  return email.toLowerCase();
}
