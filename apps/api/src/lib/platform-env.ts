import { normalizeRelyingPartyId } from "@suite/auth/platform";
import { logger, scrubStringValues } from "@suite/logger";

/**
 * Platform control-plane environment configuration.
 *
 * Every variable is pre-declared in `.env.example`. Required values fail loudly;
 * optional presentation values go through the same validator and are reported,
 * then treated as unset, so they cannot take the API (and the tenant plane) down.
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
  PLATFORM_BUILD_ID: "PLATFORM_BUILD_ID",
  PLATFORM_BUILD_TIMESTAMP: "PLATFORM_BUILD_TIMESTAMP",
  PLATFORM_ERROR_TRACKING_URL: "PLATFORM_ERROR_TRACKING_URL",
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
    throw new Error(`${key} must be a positive integer`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1 || value > maximum) {
    throw new Error(`${key} must be between 1 and ${maximum}`);
  }
  return value;
}

/**
 * One URL parser for every URL-shaped setting. Messages name the key and the
 * failure, never the value: console URLs routinely carry query tokens and
 * credentials, and an error string is the easiest place to leak them (SCR-003).
 */
function parseHttpUrl(raw: string, key: PlatformEnvKey): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`${key} must be an absolute URL`, { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} must use http or https`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${key} must not embed credentials`);
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error(`${key} must use https in production`);
  }
  return parsed;
}

function readHttpOrigin(key: PlatformEnvKey): string {
  return parseHttpUrl(readRequired(key), key).origin;
}

/**
 * An optional URL that must still parse when present. A malformed value is
 * reported and treated as unset rather than thrown: the console link is a
 * presentation concern and must not stop the API from booting.
 */
function readOptionalHttpUrl(key: PlatformEnvKey): string | null {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  try {
    return parseHttpUrl(raw.trim(), key).toString();
  } catch (error) {
    logger.error(
      {
        envKey: key,
        error: scrubStringValues(
          error instanceof Error ? error.message : String(error)
        ),
      },
      "Optional platform URL is invalid; treating it as unset"
    );
    return null;
  }
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
  return readHttpOrigin(PLATFORM_ENV_KEYS.CONTROL_PLANE_ORIGIN);
}

export function getControlWebauthnRpId(): string {
  const raw = readRequired(PLATFORM_ENV_KEYS.CONTROL_WEBAUTHN_RP_ID);
  try {
    return normalizeRelyingPartyId(raw);
  } catch (error) {
    throw new Error(
      `${PLATFORM_ENV_KEYS.CONTROL_WEBAUTHN_RP_ID} must be a valid domain name`,
      { cause: error }
    );
  }
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

export interface PlatformBuildIdentity {
  readonly buildId: string;
  readonly buildTimestamp: string;
}

export interface PlatformRuntimeConfig {
  readonly errorTrackingUrl: string | null;
  readonly buildIdentity: PlatformBuildIdentity | null;
}

/**
 * The Platform dashboard is a separate deployment. When its build identity is
 * configured, the health view reports it alongside the API (FR-034); when it
 * is absent, the API reports only the services it can attest to.
 */
export function getPlatformBuildIdentity(): PlatformBuildIdentity | null {
  const rawBuildId = process.env[PLATFORM_ENV_KEYS.PLATFORM_BUILD_ID];
  const rawBuildTimestamp = process.env[PLATFORM_ENV_KEYS.PLATFORM_BUILD_TIMESTAMP];
  const buildId = rawBuildId === undefined ? "" : rawBuildId.trim();
  const buildTimestamp =
    rawBuildTimestamp === undefined ? "" : rawBuildTimestamp.trim();

  if (buildId === "" && buildTimestamp === "") {
    return null;
  }
  if (buildId === "" || buildTimestamp === "") {
    throw new Error(
      `${PLATFORM_ENV_KEYS.PLATFORM_BUILD_ID} and ${PLATFORM_ENV_KEYS.PLATFORM_BUILD_TIMESTAMP} must be set together`
    );
  }
  if (Number.isNaN(Date.parse(buildTimestamp))) {
    throw new Error(
      `${PLATFORM_ENV_KEYS.PLATFORM_BUILD_TIMESTAMP} must be an ISO 8601 timestamp`
    );
  }
  return { buildId, buildTimestamp };
}

function readBuildIdentity(): PlatformBuildIdentity | null {
  try {
    return getPlatformBuildIdentity();
  } catch (error) {
    logger.error(
      {
        error: scrubStringValues(
          error instanceof Error ? error.message : String(error)
        ),
      },
      "Platform dashboard build identity is invalid; reporting it as unset"
    );
    return null;
  }
}

/**
 * One validated read of the optional platform presentation config. The system
 * route reads it once per request and injects it, so the health service works
 * from data instead of reaching into ambient environment state.
 */
export function readPlatformRuntimeConfig(): PlatformRuntimeConfig {
  return {
    errorTrackingUrl: readOptionalHttpUrl(
      PLATFORM_ENV_KEYS.PLATFORM_ERROR_TRACKING_URL
    ),
    buildIdentity: readBuildIdentity(),
  };
}
