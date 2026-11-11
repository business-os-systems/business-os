import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  catalogDefinitionHash,
  createCatalogPreviewReference,
  verifyCatalogPreviewReference,
} from "../../src/services/admin/app-catalog.service.js";

const SECRET = "catalog-preview-test-secret-that-is-long-enough";
const DEFINITION = {
  schemaVersion: "2026-03",
  block: {
    id: "blk_preview",
    type: "hero",
    props: { headline: "Preview" },
  },
};

function payload() {
  return {
    itemId: "catalog_item_1",
    version: 3,
    definitionHash: catalogDefinitionHash(DEFINITION),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("catalog preview reference", () => {
  it("round-trips a signed reference", () => {
    const reference = payload();
    const token = createCatalogPreviewReference(SECRET, reference);
    expect(token.startsWith("pvw.")).toBe(true);
    expect(verifyCatalogPreviewReference(SECRET, token)).toEqual(reference);
  });

  it("rejects a tampered signature", () => {
    const token = createCatalogPreviewReference(SECRET, payload());
    const tampered = token.slice(0, -2) + "AA";
    expect(verifyCatalogPreviewReference(SECRET, tampered)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = createCatalogPreviewReference(SECRET, payload());
    const parts = token.split(".");
    const encoded = parts[1];
    if (encoded === undefined) {
      throw new Error("Expected a signed preview reference");
    }
    const changed = Buffer.from(JSON.stringify({ ...payload(), version: 99 }), "utf8").toString(
      "base64url",
    );
    expect(
      verifyCatalogPreviewReference(SECRET, "pvw." + changed + "." + (parts[2] ?? "")),
    ).toBeNull();
  });

  it("rejects an expired reference", () => {
    const reference = {
      ...payload(),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    };
    const token = createCatalogPreviewReference(SECRET, reference);
    expect(verifyCatalogPreviewReference(SECRET, token)).toBeNull();
  });

  it("rejects a malformed reference", () => {
    expect(verifyCatalogPreviewReference(SECRET, "not-a-token")).toBeNull();
    expect(verifyCatalogPreviewReference(SECRET, "pvw.bad")).toBeNull();
    expect(verifyCatalogPreviewReference(SECRET, "pvw.%%%." + "x")).toBeNull();
  });

  it("hashes definitions independently of object key order", () => {
    expect(catalogDefinitionHash({ a: 1, b: 2 })).toBe(catalogDefinitionHash({ b: 2, a: 1 }));
  });

  it("orders keys by code unit, never by the host locale", () => {
    // A locale-aware comparison sorts "a" before "B"; the canonical hash must
    // not change with the ICU locale of the process that previewed or published.
    const expected = createHash("sha256").update('{"B":2,"a":1}').digest("hex");
    expect(catalogDefinitionHash({ a: 1, B: 2 })).toBe(expected);
  });
});
