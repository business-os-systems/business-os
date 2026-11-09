import { describe, expect, it } from "vitest";
import { createCatalogCache } from "@suite/redis";
import { readReferenceCatalog } from "../src/services/reference/reference-read.service.js";

const emptyStore = {
  loadRows: () => Promise.resolve([]),
};

const emptyCacheClient = {
  get: () => Promise.resolve(null),
  set: () => Promise.resolve("OK"),
  del: () => Promise.resolve(0),
};

describe("reference read missing catalog row", () => {
  it("returns 404 for a registered key with no catalog row", async () => {
    await expect(
      readReferenceCatalog({
        store: emptyStore,
        cache: createCatalogCache(emptyCacheClient),
        catalogKey: "country",
      }),
    ).rejects.toMatchObject({ status: 404, code: "UNKNOWN_CATALOG" });
  });
});
