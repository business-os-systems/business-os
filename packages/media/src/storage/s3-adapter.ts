import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ServiceUnavailableError } from "@suite/core/errors";
import type { MediaConfig } from "../env.js";
import { createMediaError } from "../errors.js";
import type {
  PresignedUpload,
  PresignedUploadRequest,
  StorageAdapter,
  StorageObjectHead,
} from "./adapter.js";

const CHECKSUM_METADATA_KEY = "checksum";
const FILE_NAME_METADATA_KEY = "file-name";

function readHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const metadata: unknown = Reflect.get(error, "$metadata");
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }
  const status: unknown = Reflect.get(metadata, "httpStatusCode");
  return typeof status === "number" ? status : null;
}

function isMissingObject(error: unknown): boolean {
  return readHttpStatus(error) === 404;
}

function storageUnavailable(error: unknown): ServiceUnavailableError {
  return new ServiceUnavailableError(
    "Object storage could not be reached.",
    {
      code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      cause: error,
    }
  );
}

function decodeMetadataValue(value: string | undefined): string | null {
  if (value === undefined || value.length === 0) {
    return null;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    throw createMediaError(
      "MEDIA_CHECKSUM_MISMATCH",
      "The stored object metadata is not decodable.",
      [{ name: "storageKey", reason: "Re-upload the file." }]
    );
  }
}

function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

function toStorageHead(output: HeadObjectCommandOutput): StorageObjectHead {
  const metadata = output.Metadata ?? {};
  return {
    sizeBytes: output.ContentLength ?? 0,
    mimeType: output.ContentType ?? "",
    checksumHex: metadata[CHECKSUM_METADATA_KEY] ?? null,
    checksumSha256Base64: output.ChecksumSHA256 ?? null,
    fileName: decodeMetadataValue(metadata[FILE_NAME_METADATA_KEY]),
  };
}

function integrityHeaders(
  request: PresignedUploadRequest,
  checksumBase64: string,
  providerChecksum: boolean
): Record<string, string> {
  return {
    "Content-Type": request.mimeType,
    "Content-Length": String(request.sizeBytes),
    ...(providerChecksum ? { "x-amz-checksum-sha256": checksumBase64 } : {}),
    [`x-amz-meta-${CHECKSUM_METADATA_KEY}`]: request.checksumHex,
    [`x-amz-meta-${FILE_NAME_METADATA_KEY}`]: encodeURIComponent(
      request.fileName
    ),
  };
}

const SIGNED_INTEGRITY_HEADERS = [
  "content-type",
  "content-length",
  "x-amz-checksum-sha256",
  `x-amz-meta-${CHECKSUM_METADATA_KEY}`,
  `x-amz-meta-${FILE_NAME_METADATA_KEY}`,
] as const;

const UNHOISTABLE_INTEGRITY_HEADERS = [
  "content-length",
  "x-amz-checksum-sha256",
  `x-amz-meta-${CHECKSUM_METADATA_KEY}`,
  `x-amz-meta-${FILE_NAME_METADATA_KEY}`,
] as const;

function filterIntegrityHeaders(
  providerChecksum: boolean,
  headers: readonly string[]
): Set<string> {
  return new Set(
    headers.filter(
      (header) => providerChecksum || header !== "x-amz-checksum-sha256"
    )
  );
}

async function signUpload(
  client: S3Client,
  config: MediaConfig,
  request: PresignedUploadRequest
): Promise<PresignedUpload> {
  const checksumBase64 = hexToBase64(request.checksumHex);
  const providerChecksum = config.checksumMode === "provider";
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: request.storageKey,
    ContentType: request.mimeType,
    ContentLength: request.sizeBytes,
    // R2 does not implement full-object SHA-256 checksums, so metadata mode
    // omits this header and relies on the signed metadata value instead.
    ...(providerChecksum ? { ChecksumSHA256: checksumBase64 } : {}),
    Metadata: {
      [CHECKSUM_METADATA_KEY]: request.checksumHex,
      [FILE_NAME_METADATA_KEY]: encodeURIComponent(request.fileName),
    },
  });
  let uploadUrl: string;
  try {
    uploadUrl = await getSignedUrl(client, command, {
      expiresIn: config.urlTtlSeconds,
      // Sign the integrity headers too: the provider rejects an upload that
      // changes the type, checksum or original name declared at intent time.
      signableHeaders: filterIntegrityHeaders(
        providerChecksum,
        SIGNED_INTEGRITY_HEADERS
      ),
      // Keeping these in the signed header list prevents the presigner from
      // hoisting them into the query string, where the provider would not
      // verify the uploaded bytes against the declared checksum.
      unhoistableHeaders: filterIntegrityHeaders(
        providerChecksum,
        UNHOISTABLE_INTEGRITY_HEADERS
      ),
    });
  } catch (error) {
    throw storageUnavailable(error);
  }
  return {
    uploadUrl,
    expiresAt: new Date(
      Date.now() + config.urlTtlSeconds * 1000
    ).toISOString(),
    requiredHeaders: integrityHeaders(
      request,
      checksumBase64,
      providerChecksum
    ),
  };
}

async function headStoredObject(
  client: S3Client,
  bucket: string,
  storageKey: string
): Promise<StorageObjectHead | null> {
  try {
    const output = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ChecksumMode: "ENABLED",
      })
    );
    return toStorageHead(output);
  } catch (error) {
    if (isMissingObject(error)) {
      return null;
    }
    throw storageUnavailable(error);
  }
}

async function deleteStoredObject(
  client: S3Client,
  bucket: string,
  storageKey: string
): Promise<void> {
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: storageKey })
    );
  } catch (error) {
    if (isMissingObject(error)) {
      return;
    }
    throw storageUnavailable(error);
  }
}

function publicUrl(config: MediaConfig, storageKey: string): string {
  const encodedKey = storageKey
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${config.publicBaseUrl}/${encodedKey}`;
}

/**
 * Real S3-compatible adapter (Cloudflare R2 or S3). Presigned URLs are signed
 * with SigV4 by the AWS SDK; the checksum and file name are signed headers so
 * the object the provider stores is the object the API verified.
 */
export function createS3StorageAdapter(config: MediaConfig): StorageAdapter {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    createUploadUrl: (request) => signUpload(client, config, request),
    headObject: (storageKey) =>
      headStoredObject(client, config.bucket, storageKey),
    removeObject: (storageKey) =>
      deleteStoredObject(client, config.bucket, storageKey),
    publicUrlFor: (storageKey) => publicUrl(config, storageKey),
  };
}
