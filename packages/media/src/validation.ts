import { isAppId } from "@suite/core";
import {
  isAllowedMimeType,
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_LIMITS,
  MEDIA_SHA256_PATTERN,
  MEDIA_STORAGE_KEY_PREFIX,
  type MediaAllowedMimeType,
} from "./constants.js";
import { createMediaError } from "./errors.js";
import type { MediaChecksumMode } from "./env.js";
import type { StorageObjectHead } from "./storage/adapter.js";

export interface UploadIntentInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface ValidatedUploadIntent {
  readonly fileName: string;
  readonly mimeType: MediaAllowedMimeType;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface FinalizeUploadInput {
  readonly storageKey: string;
  readonly checksum: string;
  readonly width?: number;
  readonly height?: number;
}

export interface VerifiedUpload {
  readonly fileName: string;
  readonly mimeType: MediaAllowedMimeType;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly width: number | null;
  readonly height: number | null;
}

const UNSAFE_FILE_NAME_PATTERN = /[\\/]/g;

function stripControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("");
}

/**
 * Keeps the display name only. Path segments are removed so a traversal
 * attempt cannot influence the storage key, which is generated server-side.
 */
export function normalizeFileName(raw: string): string {
  const withoutPath = raw.replace(UNSAFE_FILE_NAME_PATTERN, " ").trim();
  const withoutControl = stripControlCharacters(withoutPath);
  const collapsed = withoutControl.replace(/\s+/g, " ");
  if (collapsed.length === 0) {
    throw createMediaError(
      "VALIDATION_FAILED",
      "The file name has no usable characters after normalization.",
      [{ name: "fileName", reason: "Provide a non-empty file name." }]
    );
  }
  return collapsed.slice(0, MEDIA_LIMITS.MAX_FILE_NAME_LENGTH);
}

export function assertAllowedMimeType(
  mimeType: string
): asserts mimeType is MediaAllowedMimeType {
  if (isAllowedMimeType(mimeType)) {
    return;
  }
  throw createMediaError(
    "MEDIA_TYPE_NOT_ALLOWED",
    `${mimeType} is not an accepted media type.`,
    [
      {
        name: "mimeType",
        reason: `Allowed types: ${MEDIA_ALLOWED_MIME_TYPES.join(", ")}.`,
      },
    ]
  );
}

export function assertWithinSizeLimit(
  sizeBytes: number,
  maxBytes: number
): void {
  if (Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= maxBytes) {
    return;
  }
  throw createMediaError(
    "MEDIA_SIZE_EXCEEDED",
    `The file is ${sizeBytes} bytes; the limit is ${maxBytes} bytes.`,
    [
      {
        name: "sizeBytes",
        reason: `Use a file between 1 and ${maxBytes} bytes.`,
      },
    ]
  );
}

export function assertValidChecksum(checksum: string): void {
  if (MEDIA_SHA256_PATTERN.test(checksum)) {
    return;
  }
  throw createMediaError(
    "MEDIA_CHECKSUM_MISMATCH",
    "The checksum must be a lowercase SHA-256 hex digest.",
    [{ name: "checksum", reason: "Expected 64 hexadecimal characters." }]
  );
}

/**
 * A finalise key must be the key this workspace's upload-intent issued. The
 * tenant segment is checked here so a session cannot aim the storage HEAD or a
 * registration at another workspace's object. Every refusal reads the same, so
 * the endpoint cannot be used to probe whether a foreign key exists.
 */
export function assertValidStorageKey(
  storageKey: string,
  organizationId: string
): void {
  const tenantPrefix = `${MEDIA_STORAGE_KEY_PREFIX}/${organizationId}/`;
  const isCanonicalKey =
    storageKey.length <= MEDIA_LIMITS.MAX_STORAGE_KEY_LENGTH &&
    storageKey.startsWith(tenantPrefix) &&
    storageKey.length > tenantPrefix.length &&
    !storageKey.includes("..") &&
    !storageKey.includes("//") &&
    !storageKey.includes("\\") &&
    stripControlCharacters(storageKey) === storageKey &&
    !storageKey.endsWith("/");
  if (isCanonicalKey) {
    return;
  }
  throw createMediaError(
    "MEDIA_OBJECT_MISSING",
    "The storage key is not a media object key issued to this workspace.",
    [{ name: "storageKey", reason: "Use the key returned by upload-intent." }]
  );
}

/**
 * Escapes the SQL LIKE metacharacters so a search term matches literally.
 * Prisma parameterises the value, but `%` and `_` are still pattern
 * operators to PostgreSQL and would widen the result set.
 */
export function escapeSearchTerm(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function assertKnownAppId(appId: string): void {
  if (isAppId(appId)) {
    return;
  }
  throw createMediaError(
    "UNKNOWN_APP",
    `${appId} is not a registered application.`,
    [{ name: "appId", reason: "Use the appId of an installed application." }]
  );
}

export function validateUploadIntent(
  input: UploadIntentInput,
  maxBytes: number
): ValidatedUploadIntent {
  assertAllowedMimeType(input.mimeType);
  assertWithinSizeLimit(input.sizeBytes, maxBytes);
  assertValidChecksum(input.checksum);
  return {
    fileName: normalizeFileName(input.fileName),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum,
  };
}

function fileNameFromKey(storageKey: string): string {
  const segments = storageKey.split("/");
  return segments[segments.length - 1] ?? "";
}

function assertStoredSize(sizeBytes: number, maxBytes: number): void {
  if (Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= maxBytes) {
    return;
  }
  throw createMediaError(
    "MEDIA_SIZE_EXCEEDED",
    `The stored object is ${sizeBytes} bytes; the limit is ${maxBytes} bytes.`,
    [{ name: "storageKey", reason: "Upload a file within the declared limit." }]
  );
}

function assertChecksumEvidence(
  head: StorageObjectHead,
  checksumMode: MediaChecksumMode
): void {
  // Provider mode must see the provider's own SHA-256. Falling back to the
  // signed metadata alone would let a provider that ignored the header (for
  // example R2, which has no full-object checksum) pass as verified.
  const hasEvidence =
    checksumMode === "provider"
      ? head.checksumSha256Base64 !== null
      : head.checksumHex !== null;
  if (hasEvidence) {
    return;
  }
  throw createMediaError(
    "MEDIA_CHECKSUM_MISMATCH",
    checksumMode === "provider"
      ? "The storage provider returned no SHA-256 checksum, so the uploaded bytes cannot be verified."
      : "The stored object carries no checksum metadata, so its integrity cannot be verified.",
    [{ name: "storageKey", reason: "Re-upload the file with its checksum headers." }]
  );
}

function assertChecksumValues(input: {
  readonly head: StorageObjectHead;
  readonly checksum: string;
  readonly expectedChecksumBase64: string;
}): void {
  const { head, checksum, expectedChecksumBase64 } = input;
  if (head.checksumHex !== null && head.checksumHex !== checksum) {
    throw createMediaError(
      "MEDIA_CHECKSUM_MISMATCH",
      "The stored object checksum does not match the finalise request.",
      [{ name: "checksum", reason: "Upload the file whose checksum you declared." }]
    );
  }
  if (
    head.checksumSha256Base64 !== null &&
    head.checksumSha256Base64 !== expectedChecksumBase64
  ) {
    throw createMediaError(
      "MEDIA_CHECKSUM_MISMATCH",
      "The storage provider verified a different SHA-256 checksum.",
      [{ name: "checksum", reason: "Upload the file whose checksum you declared." }]
    );
  }
}

function assertStoredChecksum(input: {
  readonly head: StorageObjectHead;
  readonly checksum: string;
  readonly expectedChecksumBase64: string;
  readonly checksumMode: MediaChecksumMode;
}): void {
  assertChecksumEvidence(input.head, input.checksumMode);
  assertChecksumValues(input);
}

/**
 * Re-checks the object the storage provider actually received against the
 * intent. A mismatch discards the object before any row is registered.
 */
export function verifyUploadedObject(input: {
  readonly head: StorageObjectHead;
  readonly declared: FinalizeUploadInput;
  readonly maxBytes: number;
  readonly expectedChecksumBase64: string;
  readonly checksumMode: MediaChecksumMode;
}): VerifiedUpload {
  const { head, declared, maxBytes, expectedChecksumBase64, checksumMode } =
    input;
  assertStoredSize(head.sizeBytes, maxBytes);
  assertAllowedMimeType(head.mimeType);
  assertValidChecksum(declared.checksum);
  assertStoredChecksum({
    head,
    checksum: declared.checksum,
    expectedChecksumBase64,
    checksumMode,
  });
  return {
    fileName: normalizeFileName(head.fileName ?? fileNameFromKey(declared.storageKey)),
    mimeType: head.mimeType,
    sizeBytes: head.sizeBytes,
    checksum: declared.checksum,
    width: declared.width ?? null,
    height: declared.height ?? null,
  };
}

/** Builds a server-owned key; the client file name never becomes a path. */
export function buildStorageKey(input: {
  readonly organizationId: string;
  readonly mimeType: MediaAllowedMimeType;
  readonly now: Date;
  readonly uniqueId: string;
}): string {
  const year = String(input.now.getUTCFullYear());
  const month = String(input.now.getUTCMonth() + 1).padStart(2, "0");
  return [
    MEDIA_STORAGE_KEY_PREFIX,
    input.organizationId,
    year,
    month,
    `${input.uniqueId}${extensionForMimeType(input.mimeType)}`,
  ].join("/");
}

const MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
} as const satisfies Record<MediaAllowedMimeType, string>;

export function extensionForMimeType(mimeType: MediaAllowedMimeType): string {
  return MIME_EXTENSIONS[mimeType];
}
