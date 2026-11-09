/**
 * Reference-catalog cache (CT-11, FR-110).
 *
 * Key:    platform:reference-catalog:list
 *         platform:reference-catalog:<catalogKey>
 * TTL:    configured by CATALOG_CACHE_TTL_SECONDS (60 seconds by default).
 * Trigger: every catalog value create, update, retire or reactivate deletes
 *          the affected catalog key and the list key after the write commits.
 *
 * The cache stores the canonical JSON DTO, never a Prisma row. Redis is not a
 * source of truth: a failed read or write is reported to the caller, which
 * falls back to PostgreSQL. The TTL bounds staleness even when invalidation
 * fails, so a cache outage can never pin an old vocabulary.
 */

export const CATALOG_CACHE_KEY_PREFIX = "platform:reference-catalog";
export const CATALOG_CACHE_DEFAULT_TTL_SECONDS = 60;
export const CATALOG_CACHE_INVALIDATION_TRIGGER =
  "catalog value create, update, retire or reactivate";

export const CATALOG_CACHE_POLICY = {
  key: `${CATALOG_CACHE_KEY_PREFIX}:{list|<catalogKey>}`,
  ttlSeconds: CATALOG_CACHE_DEFAULT_TTL_SECONDS,
  invalidationTrigger: CATALOG_CACHE_INVALIDATION_TRIGGER,
} as const;

/** A missing key (null) addresses the list payload; a key addresses one catalog. */
export type CatalogCacheKey = string | null;

/**
 * The narrow Redis surface the cache needs. Keeping it structural means the
 * shared ioredis client satisfies it without a cast and tests can use a fake.
 */
export interface CatalogCacheClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number,
  ): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface ReadCatalogCacheOptions<T> {
  readonly catalogKey: CatalogCacheKey;
  readonly parse: (value: unknown) => T;
}

export interface WriteCatalogCacheOptions<T> {
  readonly catalogKey: CatalogCacheKey;
  readonly value: T;
  readonly ttlSeconds: number;
}

export interface CatalogCache {
  read<T>(options: ReadCatalogCacheOptions<T>): Promise<T | null>;
  write<T>(options: WriteCatalogCacheOptions<T>): Promise<void>;
  invalidate(catalogKey: CatalogCacheKey): Promise<void>;
}

/** One key per catalog, plus the list key that carries every catalog. */
export function catalogCacheKey(catalogKey: CatalogCacheKey): string {
  return catalogKey === null
    ? `${CATALOG_CACHE_KEY_PREFIX}:list`
    : `${CATALOG_CACHE_KEY_PREFIX}:${catalogKey}`;
}

export function createCatalogCache(client: CatalogCacheClient): CatalogCache {
  return {
    async read<T>({
      catalogKey,
      parse,
    }: ReadCatalogCacheOptions<T>): Promise<T | null> {
      const raw = await client.get(catalogCacheKey(catalogKey));
      if (raw === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return parse(parsed);
    },

    async write<T>({
      catalogKey,
      value,
      ttlSeconds,
    }: WriteCatalogCacheOptions<T>): Promise<void> {
      await client.set(
        catalogCacheKey(catalogKey),
        JSON.stringify(value),
        "EX",
        ttlSeconds,
      );
    },

    /**
     * A write to one catalog also changes the list payload, so both keys go.
     * A list-only invalidation addresses just the list key.
     */
    async invalidate(catalogKey: CatalogCacheKey): Promise<void> {
      if (catalogKey === null) {
        await client.del(catalogCacheKey(null));
        return;
      }
      await client.del(catalogCacheKey(catalogKey), catalogCacheKey(null));
    },
  };
}
