import { describe, expect, it } from "vitest";
import type { MediaConfig } from "../src/env.js";
import { createS3StorageAdapter } from "../src/storage/s3-adapter.js";

const CONFIG: MediaConfig = {
  bucket: "business-os-media",
  region: "auto",
  endpoint: "https://storage.example.com",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  publicBaseUrl: "https://cdn.example.com/business-os-media",
  maxBytes: 10_485_760,
  urlTtlSeconds: 900,
};

const CHECKSUM = "a".repeat(64);

describe("S3-compatible storage adapter", () => {
  it("signs a direct upload URL with SigV4 and the declared headers", async () => {
    const adapter = createS3StorageAdapter(CONFIG);
    const presigned = await adapter.createUploadUrl({
      storageKey: "media/org_1/2026/01/abc.png",
      mimeType: "image/png",
      sizeBytes: 1_024,
      checksumHex: CHECKSUM,
      fileName: "room photo.png",
    });

    const url = new URL(presigned.uploadUrl);
    expect(url.origin).toBe("https://storage.example.com");
    expect(url.pathname).toBe("/business-os-media/media/org_1/2026/01/abc.png");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain("test-access-key");

    const signedHeaders = decodeURIComponent(
      url.searchParams.get("X-Amz-SignedHeaders") ?? ""
    );
    expect(signedHeaders).toContain("content-type");
    expect(signedHeaders).toContain("content-length");
    expect(signedHeaders).toContain("x-amz-checksum-sha256");
    expect(signedHeaders).toContain("x-amz-meta-checksum");
    expect(signedHeaders).toContain("x-amz-meta-file-name");

    expect(presigned.requiredHeaders["Content-Type"]).toBe("image/png");
    expect(presigned.requiredHeaders["Content-Length"]).toBe("1024");
    expect(presigned.requiredHeaders["x-amz-meta-checksum"]).toBe(CHECKSUM);
    expect(Promise.resolve(presigned.expiresAt)).toBeTruthy();
  });

  it("derives a stable public URL for a stored key", () => {
    const adapter = createS3StorageAdapter(CONFIG);
    expect(adapter.publicUrlFor("media/org_1/2026/01/abc.png")).toBe(
      "https://cdn.example.com/business-os-media/media/org_1/2026/01/abc.png"
    );
  });
});
