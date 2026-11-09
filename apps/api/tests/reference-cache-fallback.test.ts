import { describe, expect, it } from "vitest";
import { createCatalogCache } from "@suite/redis";
import { getPlatformPrismaClient } from "../src/lib/platform-db.js";
import {
  createPrismaCatalogStore,
  readReferenceCatalogList,
} from "../src/services/reference/reference-read.service.js";
import { loadPlatformTestEnv } from "./helpers/platform-env.js";
import { platformOperatorTestsEnabled } from "./helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();

const failingCacheClient = {
  get: () => Promise.reject(new Error("redis is unavailable")),
  set: () => Promise.reject(new Error("redis is unavailable")),
  del: () => Promise.reject(new Error("redis is unavailable")),
};

describe("reference catalog cache fallback", () => {
  it.skipIf(!enabled)(
    "serves the database when the cache read and write both fail",
    async () => {
      const result = await readReferenceCatalogList({
        store: createPrismaCatalogStore(getPlatformPrismaClient()),
        cache: createCatalogCache(failingCacheClient),
      });

      expect(result.payload.catalogs.length).toBeGreaterThan(0);
      expect(result.etag).toMatch(/^"[0-9a-f]{64}"$/);
    },
  );
});
