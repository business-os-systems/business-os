import { describe, expect, it } from "vitest";
import {
  CATALOG_CACHE_DEFAULT_TTL_SECONDS,
  CATALOG_CACHE_KEY_PREFIX,
  CATALOG_CACHE_POLICY,
  catalogCacheKey,
  createCatalogCache,
  type CatalogCacheClient,
} from "../src/index.js";

class FakeCatalogCacheClient implements CatalogCacheClient {
  private readonly entries = new Map<
    string,
    { readonly value: string; readonly ttlSeconds: number }
  >();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.entries.get(key)?.value ?? null);
  }

  set(
    key: string,
    value: string,
    _mode: "EX",
    ttlSeconds: number,
  ): Promise<unknown> {
    this.entries.set(key, { value, ttlSeconds });
    return Promise.resolve("OK");
  }

  del(...keys: string[]): Promise<number> {
    return Promise.resolve(keys.filter((key) => this.entries.delete(key)).length);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  ttlFor(key: string): number | undefined {
    return this.entries.get(key)?.ttlSeconds;
  }
}

function parseStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("The cached catalog payload is not a string array");
  }
  return value;
}

describe("reference catalog cache policy", () => {
  it("declares the key, TTL and invalidation trigger (CT-11)", () => {
    expect(CATALOG_CACHE_POLICY.key).toContain(CATALOG_CACHE_KEY_PREFIX);
    expect(CATALOG_CACHE_POLICY.ttlSeconds).toBe(60);
    expect(CATALOG_CACHE_DEFAULT_TTL_SECONDS).toBe(60);
    expect(CATALOG_CACHE_POLICY.invalidationTrigger).toMatch(/create/);
  });

  it("names one key per catalog plus the list key", () => {
    expect(catalogCacheKey(null)).toBe(`${CATALOG_CACHE_KEY_PREFIX}:list`);
    expect(catalogCacheKey("currency")).toBe(
      `${CATALOG_CACHE_KEY_PREFIX}:currency`,
    );
  });
});

describe("reference catalog cache entries", () => {
  it("round-trips a payload with the caller's configured TTL", async () => {
    const client = new FakeCatalogCacheClient();
    const cache = createCatalogCache(client);
    const value = ["INR", "USD"];

    await cache.write({ catalogKey: "currency", value, ttlSeconds: 30 });

    expect(client.ttlFor(catalogCacheKey("currency"))).toBe(30);
    await expect(
      cache.read({ catalogKey: "currency", parse: parseStringArray }),
    ).resolves.toEqual(value);
  });

  it("returns null on a cache miss", async () => {
    const cache = createCatalogCache(new FakeCatalogCacheClient());
    await expect(
      cache.read({ catalogKey: "currency", parse: parseStringArray }),
    ).resolves.toBeNull();
  });

  it("drops the catalog and the list when one catalog changes", async () => {
    const client = new FakeCatalogCacheClient();
    const cache = createCatalogCache(client);
    await cache.write({ catalogKey: "currency", value: ["INR"], ttlSeconds: 60 });
    await cache.write({ catalogKey: "timezone", value: ["UTC"], ttlSeconds: 60 });
    await cache.write({
      catalogKey: null,
      value: ["currency", "timezone"],
      ttlSeconds: 60,
    });

    await cache.invalidate("currency");

    expect(client.has(catalogCacheKey("currency"))).toBe(false);
    expect(client.has(catalogCacheKey(null))).toBe(false);
    expect(client.has(catalogCacheKey("timezone"))).toBe(true);
  });

  it("drops only the list when the invalidation has no catalog key", async () => {
    const client = new FakeCatalogCacheClient();
    const cache = createCatalogCache(client);
    await cache.write({ catalogKey: "currency", value: ["INR"], ttlSeconds: 60 });
    await cache.write({ catalogKey: null, value: ["currency"], ttlSeconds: 60 });

    await cache.invalidate(null);

    expect(client.has(catalogCacheKey(null))).toBe(false);
    expect(client.has(catalogCacheKey("currency"))).toBe(true);
  });
});
