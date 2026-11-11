import { describe, expect, it } from "vitest";
import { MediaUsageStatus } from "@suite/db";
import { assertAssetDeletable } from "../src/assets/usage-service.js";
import { MediaInUseError } from "../src/errors.js";

const published = {
  appId: "website-builder",
  resourceType: "Page",
  resourceId: "page_1",
  subKey: "hero",
  status: MediaUsageStatus.PUBLISHED,
} as const;

const draft = {
  ...published,
  status: MediaUsageStatus.DRAFT,
} as const;

describe("media deletion guard", () => {
  it("allows deletion when the asset has no usages", () => {
    expect(() => assertAssetDeletable([])).not.toThrow();
  });

  it("allows deletion when every usage is a draft", () => {
    expect(() => assertAssetDeletable([draft])).not.toThrow();
  });

  it("refuses deletion while a published usage exists", () => {
    try {
      assertAssetDeletable([draft, published]);
      throw new Error("Expected a MEDIA_IN_USE refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(MediaInUseError);
      if (!(error instanceof MediaInUseError)) {
        throw error;
      }
      expect(error.code).toBe("MEDIA_IN_USE");
      expect(error.status).toBe(409);
      expect(error.references).toHaveLength(1);
      expect(error.invalidParams).toEqual([
        {
          name: "website-builder:Page",
          reason: "page_1#hero",
        },
      ]);
    }
  });
});
