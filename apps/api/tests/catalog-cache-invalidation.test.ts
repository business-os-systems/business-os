import { describe, expect, it } from "vitest";
import { createCatalogCache } from "@suite/redis";
import { invalidateCatalogCacheAfterCommit } from "../src/services/admin/catalog-admin.service.js";

const failingCacheClient = {
  get: () => Promise.reject(new Error("redis is unavailable")),
  set: () => Promise.reject(new Error("redis is unavailable")),
  del: () => Promise.reject(new Error("redis is unavailable")),
};

describe("catalog cache invalidation failure", () => {
  it("logs the failure without failing the committed mutation", async () => {
    const cache = createCatalogCache(failingCacheClient);

    await expect(
      invalidateCatalogCacheAfterCommit(cache, "currency"),
    ).resolves.toBeUndefined();
  });
});
