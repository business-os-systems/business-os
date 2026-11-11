import { describe, expect, it } from "vitest";
import {
  APP_CATALOG_CACHE_POLICY,
  createAppCatalogCacheInvalidator,
} from "../../src/services/admin/app-catalog.service.js";

describe("application catalog cache invalidation", () => {
  it("removes the list and the item under the declared prefix", async () => {
    const deleted: string[][] = [];
    const invalidator = createAppCatalogCacheInvalidator({
      del: (...keys) => {
        deleted.push(keys.map((key) => String(key)));
        return Promise.resolve(keys.length);
      },
    });

    await invalidator.invalidate("catalog_item_1");

    expect(deleted).toEqual([
      [
        APP_CATALOG_CACHE_POLICY.keyPrefix + "items",
        APP_CATALOG_CACHE_POLICY.keyPrefix + "catalog_item_1",
      ],
    ]);
  });

  it("leaves a committed write successful when the cache is unavailable", async () => {
    const invalidator = createAppCatalogCacheInvalidator({
      del: () => Promise.reject(new Error("redis unavailable")),
    });

    await expect(invalidator.invalidate("catalog_item_1")).resolves.toBeUndefined();
  });
});
