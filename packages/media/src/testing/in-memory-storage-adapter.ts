import { createHash } from "node:crypto";
import type {
  PresignedUpload,
  PresignedUploadRequest,
  StorageAdapter,
  StorageObjectHead,
} from "../storage/adapter.js";

interface StoredObject {
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly checksumHex: string;
  readonly fileName: string;
}

/**
 * Deterministic storage double for tests only. It is exported from the
 * @suite/media/testing subpath and is never imported by runtime code or by the
 * package barrel. There is no runtime fallback to it: a missing S3
 * configuration still fails loudly.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly publicBaseUrl = "https://media.test.invalid") {}

  createUploadUrl(
    request: PresignedUploadRequest
  ): Promise<PresignedUpload> {
    const signature = createHash("sha256")
      .update(`${request.storageKey}:${request.checksumHex}`)
      .digest("hex");
    return Promise.resolve({
      uploadUrl: `${this.publicBaseUrl}/${request.storageKey}?X-Amz-Expires=900&X-Amz-Signature=${signature}`,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      requiredHeaders: {
        "Content-Type": request.mimeType,
        "x-amz-checksum-sha256": Buffer.from(
          request.checksumHex,
          "hex"
        ).toString("base64"),
        "x-amz-meta-checksum": request.checksumHex,
      },
    });
  }

  headObject(storageKey: string): Promise<StorageObjectHead | null> {
    const object = this.objects.get(storageKey);
    if (object === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      sizeBytes: object.sizeBytes,
      mimeType: object.mimeType,
      checksumHex: object.checksumHex,
      checksumSha256Base64: Buffer.from(
        object.checksumHex,
        "hex"
      ).toString("base64"),
      fileName: object.fileName,
    });
  }

  removeObject(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
    return Promise.resolve();
  }

  publicUrlFor(storageKey: string): string {
    return `${this.publicBaseUrl}/${storageKey}`;
  }

  /** Simulates the direct PUT the client performs against object storage. */
  putObject(input: {
    readonly storageKey: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly checksumHex: string;
    readonly fileName: string;
  }): void {
    this.objects.set(input.storageKey, {
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      checksumHex: input.checksumHex,
      fileName: input.fileName,
    });
  }

  objectCount(): number {
    return this.objects.size;
  }

  hasObject(storageKey: string): boolean {
    return this.objects.has(storageKey);
  }
}
