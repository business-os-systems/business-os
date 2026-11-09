import { createCatalogCache, redis, type CatalogCache } from "@suite/redis";

/**
 * One process-wide reference-catalog cache. Routes receive it through their
 * service context; transport code never imports the cache client (P2).
 */
export const platformCatalogCache: CatalogCache = createCatalogCache(redis);
