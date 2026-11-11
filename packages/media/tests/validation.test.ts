import { describe, expect, it } from "vitest";
import { AppError } from "@suite/core/errors";
import {
  assertAllowedMimeType,
  assertKnownAppId,
  assertValidChecksum,
  assertValidStorageKey,
  buildStorageKey,
  escapeSearchTerm,
  normalizeFileName,
  validateUploadIntent,
  verifyUploadedObject,
} from "../src/validation.js";

const CHECKSUM = "a".repeat(64);
const MAX_BYTES = 10_000;

const HEAD = {
  sizeBytes: 1_024,
  mimeType: "image/png",
  checksumHex: CHECKSUM,
  checksumSha256Base64: Buffer.from(CHECKSUM, "hex").toString("base64"),
  fileName: "room.png",
} as const;

const VALID_INTENT = {
  fileName: "room.png",
  mimeType: "image/png",
  sizeBytes: 1_024,
  checksum: CHECKSUM,
} as const;

function captureError(run: () => void): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected a typed media error");
}

describe("media upload validation", () => {
  it("accepts every declared image type within the size limit", () => {
    const validated = validateUploadIntent(VALID_INTENT, MAX_BYTES);
    expect(validated).toEqual({
      fileName: "room.png",
      mimeType: "image/png",
      sizeBytes: 1_024,
      checksum: CHECKSUM,
    });
  });

  it("refuses an undeclared mime type with a 422 MEDIA_TYPE_NOT_ALLOWED", () => {
    const error = captureError(() =>
      assertAllowedMimeType("image/svg+xml")
    );
    expect(error.code).toBe("MEDIA_TYPE_NOT_ALLOWED");
    expect(error.status).toBe(422);
    expect(error.type).toBe("/errors/media-type-not-allowed");
  });

  it("refuses a file above the declared limit with a 413 MEDIA_SIZE_EXCEEDED", () => {
    const error = captureError(() =>
      validateUploadIntent({ ...VALID_INTENT, sizeBytes: MAX_BYTES + 1 }, MAX_BYTES)
    );
    expect(error.code).toBe("MEDIA_SIZE_EXCEEDED");
    expect(error.status).toBe(413);
  });

  it("refuses a checksum that is not a SHA-256 hex digest", () => {
    const error = captureError(() => assertValidChecksum("not-a-checksum"));
    expect(error.code).toBe("MEDIA_CHECKSUM_MISMATCH");
    expect(error.status).toBe(422);
  });

  it("normalizes a traversal file name without keeping path separators", () => {
    const name = normalizeFileName("../../etc/passwd.png");
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
    expect(normalizeFileName("  cute  cat.png  ")).toBe("cute cat.png");
  });

  it("builds a server-owned key that includes the tenant and canonical extension", () => {
    const key = buildStorageKey({
      organizationId: "org_123",
      mimeType: "image/png",
      now: new Date("2026-01-05T12:00:00.000Z"),
      uniqueId: "0f8fad5b",
    });
    expect(key).toBe("media/org_123/2026/01/0f8fad5b.png");
  });

  it("accepts a registered application and refuses an unknown one", () => {
    expect(() => assertKnownAppId("website-builder")).not.toThrow();
    const error = captureError(() => assertKnownAppId("legacy-cms"));
    expect(error.code).toBe("UNKNOWN_APP");
  });

  it("refuses a file name with no usable characters as a validation failure", () => {
    const error = captureError(() => normalizeFileName("\u0000\u0001"));
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.status).toBe(422);
  });
});

describe("media storage key scope", () => {
  it("accepts the key the acting tenant's upload-intent issues", () => {
    expect(() =>
      assertValidStorageKey("media/org_123/2026/11/abc.png", "org_123")
    ).not.toThrow();
  });

  it("refuses a key scoped to another tenant without echoing it", () => {
    const error = captureError(() =>
      assertValidStorageKey("media/org_other/2026/11/abc.png", "org_123")
    );
    expect(error.code).toBe("MEDIA_OBJECT_MISSING");
    expect(error.detail).not.toContain("org_other");
  });

  it("refuses traversal, non-canonical separators and foreign prefixes", () => {
    const refused = [
      "media/org_123/../org_other/abc.png",
      "media/org_123//abc.png",
      "media/org_123/",
      "other/org_123/abc.png",
      "media/org_123/abc\\.png",
    ];
    for (const storageKey of refused) {
      expect(() => assertValidStorageKey(storageKey, "org_123"), storageKey).toThrow();
    }
  });
});

describe("media search escaping", () => {
  it("escapes the SQL LIKE metacharacters so a term matches literally", () => {
    expect(escapeSearchTerm("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("media finalise verification", () => {
  it("accepts an object whose size, type and checksum match the intent", () => {
    const verified = verifyUploadedObject({
      head: HEAD,
      declared: { storageKey: "media/org/2026/01/a.png", checksum: CHECKSUM },
      maxBytes: MAX_BYTES,
      expectedChecksumBase64: Buffer.from(CHECKSUM, "hex").toString("base64"),
    });
    expect(verified.checksum).toBe(CHECKSUM);
    expect(verified.fileName).toBe("room.png");
    expect(verified.width).toBeNull();
  });

  it("refuses an object whose stored checksum differs", () => {
    const error = captureError(() =>
      verifyUploadedObject({
        head: { ...HEAD, checksumHex: "b".repeat(64) },
        declared: { storageKey: "media/org/2026/01/a.png", checksum: CHECKSUM },
        maxBytes: MAX_BYTES,
        expectedChecksumBase64: Buffer.from(CHECKSUM, "hex").toString("base64"),
      })
    );
    expect(error.code).toBe("MEDIA_CHECKSUM_MISMATCH");
  });
});

describe("media finalise verification: checksum and name", () => {
  it("refuses an object with no checksum evidence", () => {
    const error = captureError(() =>
      verifyUploadedObject({
        head: { ...HEAD, checksumHex: null, checksumSha256Base64: null },
        declared: { storageKey: "media/org/2026/01/a.png", checksum: CHECKSUM },
        maxBytes: MAX_BYTES,
        expectedChecksumBase64: Buffer.from(CHECKSUM, "hex").toString("base64"),
      })
    );
    expect(error.code).toBe("MEDIA_CHECKSUM_MISMATCH");
  });

  it("normalizes the stored file name before it reaches the database", () => {
    const verified = verifyUploadedObject({
      head: { ...HEAD, fileName: "folder/\u0000hero.png" },
      declared: { storageKey: "media/org/2026/01/a.png", checksum: CHECKSUM },
      maxBytes: MAX_BYTES,
      expectedChecksumBase64: Buffer.from(CHECKSUM, "hex").toString("base64"),
    });
    expect(verified.fileName).toBe("folder hero.png");
  });

  it("refuses an object over the size limit", () => {
    const error = captureError(() =>
      verifyUploadedObject({
        head: { ...HEAD, sizeBytes: MAX_BYTES + 1 },
        declared: { storageKey: "media/org/2026/01/a.png", checksum: CHECKSUM },
        maxBytes: MAX_BYTES,
        expectedChecksumBase64: Buffer.from(CHECKSUM, "hex").toString("base64"),
      })
    );
    expect(error.code).toBe("MEDIA_SIZE_EXCEEDED");
  });
});
