/**
 * Storage port for the shared media library. The API never proxies object
 * bytes: it signs a direct upload, then verifies the stored object's metadata
 * on finalise. Implementations are S3-compatible or the test-only in-memory
 * adapter exported from @suite/media/testing.
 */
export interface PresignedUploadRequest {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksumHex: string;
  readonly fileName: string;
}

export interface PresignedUpload {
  readonly uploadUrl: string;
  readonly expiresAt: string;
  /** Headers the client must send unchanged; they are part of the signature. */
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface StorageObjectHead {
  readonly sizeBytes: number;
  readonly mimeType: string;
  /** Hex SHA-256 carried in signed object metadata, when present. */
  readonly checksumHex: string | null;
  /** Base64 SHA-256 verified by the provider, when present. */
  readonly checksumSha256Base64: string | null;
  readonly fileName: string | null;
}

export interface StorageAdapter {
  createUploadUrl(request: PresignedUploadRequest): Promise<PresignedUpload>;
  headObject(storageKey: string): Promise<StorageObjectHead | null>;
  removeObject(storageKey: string): Promise<void>;
  publicUrlFor(storageKey: string): string;
}
