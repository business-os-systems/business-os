import { isTemplateSecret } from "@suite/core";
import { MEDIA_LIMITS } from "./constants.js";

/**
 * Where the SHA-256 checksum is enforced.
 *
 * - `provider`: sign the full-object SHA-256 header, so the storage provider
 *   refuses bytes that do not match the declared checksum (S3, MinIO).
 * - `metadata`: sign only the checksum metadata. Required by Cloudflare R2,
 *   whose S3 API does not implement full-object SHA-256 checksums; finalise
 *   still re-checks size, type and the signed metadata value.
 */
export const MEDIA_CHECKSUM_MODES = ["provider", "metadata"] as const;
export type MediaChecksumMode = (typeof MEDIA_CHECKSUM_MODES)[number];

/**
 * Typed media configuration (Env-First Pre-Declaration Law). Every storage key
 * is required; there is no inline fallback, so a missing variable fails before
 * a presigned URL can be issued. `MEDIA_S3_CHECKSUM_MODE` is the one declared
 * exception: it defaults to `provider` when unset and is documented in the env
 * examples with the R2 trade-off.
 */
export interface MediaConfig {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBaseUrl: string;
  readonly maxBytes: number;
  readonly urlTtlSeconds: number;
  readonly checksumMode: MediaChecksumMode;
}

function isChecksumMode(value: string): value is MediaChecksumMode {
  return MEDIA_CHECKSUM_MODES.some((mode) => mode === value);
}

function readChecksumMode(env: NodeJS.ProcessEnv): MediaChecksumMode {
  const raw = env.MEDIA_S3_CHECKSUM_MODE?.trim();
  if (raw === undefined || raw.length === 0) {
    return "provider";
  }
  if (!isChecksumMode(raw)) {
    throw new Error(
      `MEDIA_S3_CHECKSUM_MODE must be one of ${MEDIA_CHECKSUM_MODES.join(", ")}; received "${raw}".`
    );
  }
  return raw;
}

function requireEnvValue(
  env: NodeJS.ProcessEnv,
  name: string
): string {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} environment variable must be pre-declared in .env before media can serve requests.`
    );
  }
  return value;
}

function requireAbsoluteHttpUrl(
  env: NodeJS.ProcessEnv,
  name: string
): string {
  const value = requireEnvValue(env, name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`${name} must be an absolute http(s) URL.`, { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use the http or https scheme.`);
  }
  return value.replace(/\/$/, "");
}

function requirePositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  maximum?: number
): number {
  const raw = requireEnvValue(env, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received "${raw}".`);
  }
  if (maximum !== undefined && value > maximum) {
    throw new Error(
      `${name} must not exceed ${maximum}; received "${raw}".`
    );
  }
  return value;
}

/** Reads the media configuration or throws with the exact missing key. */
export function readMediaConfig(
  env: NodeJS.ProcessEnv = process.env
): MediaConfig {
  return {
    bucket: requireEnvValue(env, "MEDIA_BUCKET"),
    region: requireEnvValue(env, "MEDIA_S3_REGION"),
    endpoint: requireAbsoluteHttpUrl(env, "MEDIA_S3_ENDPOINT"),
    accessKeyId: requireEnvValue(env, "MEDIA_S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvValue(env, "MEDIA_S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: requireAbsoluteHttpUrl(env, "MEDIA_PUBLIC_BASE_URL"),
    maxBytes: requirePositiveInteger(env, "MEDIA_MAX_BYTES"),
    urlTtlSeconds: requirePositiveInteger(
      env,
      "MEDIA_URL_TTL_SECONDS",
      MEDIA_LIMITS.MAX_URL_TTL_SECONDS
    ),
    checksumMode: readChecksumMode(env),
  };
}

/**
 * Production boot guard: placeholder credentials must never issue a signed
 * URL. Development may keep the documented placeholders so the API can start.
 */
export function assertMediaConfiguration(
  env: NodeJS.ProcessEnv = process.env
): MediaConfig {
  const config = readMediaConfig(env);
  for (const name of ["MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY"]) {
    const value = requireEnvValue(env, name);
    if (isTemplateSecret(value)) {
      throw new Error(
        `${name} still holds a published template value. Set real storage credentials before starting in production.`
      );
    }
  }
  return config;
}