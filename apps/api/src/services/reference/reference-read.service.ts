import { createHash } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE, isCatalogKey, type CatalogKey } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import { logger } from "@suite/logger";
import {
  catalogCacheKey,
  type CatalogCache,
  type CatalogCacheKey,
} from "@suite/redis";
import { getCatalogCacheTtlSeconds } from "../../lib/platform-env.js";
import {
  catalogMetadataSchema,
  referenceCatalogSchema,
  type ReferenceCatalog,
  type ReferenceCatalogList,
  type ReferenceCatalogResponse,
} from "./reference-read.contract.js";

/**
 * Reference read service (FR-105, FR-112, CT-7, CT-11).
 *
 * The Platform database identity reads the control-plane reference tables
 * because this route also serves the operator control session; the tenant
 * identity reads the granted active-values view instead. The returned DTO is a
 * whitelisted projection, never a Prisma row. Retired values are filtered in
 * the query so a retired code can never be selected again (FR-104).
 *
 * Reads go through the catalog cache (CATALOG_CACHE_TTL_SECONDS, 60 seconds by
 * default). A cache failure is logged and the database answers; a write that
 * changes a catalog invalidates the affected key and the list key after commit.
 * The TTL is the backstop, so a missed invalidation can never pin a vocabulary
 * for more than a minute.
 */

const ACTIVE_VALUE_ORDER = [{ sortOrder: "asc" }, { label: "asc" }, { code: "asc" }] as const;

interface CatalogValueRow {
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly metadata: unknown;
}

interface CatalogRow {
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly values: readonly CatalogValueRow[];
}

export interface ReferenceReadResult<TPayload> {
  readonly payload: TPayload;
  readonly etag: string;
}

/**
 * The narrow read seam the service needs. Keeping Prisma behind this interface
 * lets the missing-row path be unit-tested without a database (P2).
 */
export interface CatalogReadStore {
  loadRows(catalogKey?: CatalogKey): Promise<readonly CatalogRow[]>;
}

export interface ReferenceReadContext {
  readonly store: CatalogReadStore;
  readonly cache: CatalogCache;
}

export interface ReadReferenceCatalogOptions extends ReferenceReadContext {
  readonly catalogKey: string;
}

interface CatalogCacheRead<T> {
  readonly cache: CatalogCache;
  readonly catalogKey: CatalogCacheKey;
  readonly parse: (value: unknown) => T;
  readonly load: () => Promise<T>;
}

function toReferenceCatalog(row: CatalogRow): ReferenceCatalog {
  return referenceCatalogSchema.parse({
    key: row.key,
    label: row.label,
    description: row.description,
    values: row.values.map((value) => ({
      code: value.code,
      label: value.label,
      sortOrder: value.sortOrder,
      metadata: catalogMetadataSchema.parse(value.metadata),
    })),
  });
}

/**
 * A strong ETag over the canonical payload. The query order is stable, so an
 * unchanged catalog produces the same hash and the client gets a 304 (CT-11).
 */
function buildEtag(payload: unknown): string {
  const canonical = JSON.stringify(payload);
  return `"${createHash("sha256").update(canonical).digest("hex")}"`;
}

function assertCatalogKey(value: string): CatalogKey {
  if (!isCatalogKey(value)) {
    throw new NotFoundError(`Unknown reference catalog: ${value}.`, {
      code: PLATFORM_ERROR_CODE.UNKNOWN_CATALOG,
    });
  }
  return value;
}

async function loadCatalogRows(
  prisma: PrismaClient,
  catalogKey?: CatalogKey,
): Promise<readonly CatalogRow[]> {
  return prisma.catalog.findMany({
    where: catalogKey === undefined ? undefined : { key: catalogKey },
    orderBy: { key: "asc" },
    include: {
      values: {
        where: { isActive: true },
        orderBy: [...ACTIVE_VALUE_ORDER],
      },
    },
  });
}

export function createPrismaCatalogStore(
  prisma: PrismaClient,
): CatalogReadStore {
  return { loadRows: (catalogKey) => loadCatalogRows(prisma, catalogKey) };
}

function parseCatalogList(value: unknown): readonly ReferenceCatalog[] {
  return referenceCatalogSchema.array().parse(value);
}

function parseCatalog(value: unknown): ReferenceCatalog {
  return referenceCatalogSchema.parse(value);
}

async function readThroughCatalogCache<T>(
  options: CatalogCacheRead<T>,
): Promise<T> {
  const { cache, catalogKey: key, parse, load } = options;
  try {
    const cached = await cache.read({ catalogKey: key, parse });
    if (cached !== null) {
      return cached;
    }
  } catch (error) {
    logger.warn(
      { err: error, cacheKey: catalogCacheKey(key) },
      "Reference catalog cache read failed; reading the database",
    );
  }

  const fresh = await load();
  try {
    await cache.write({
      catalogKey: key,
      value: fresh,
      ttlSeconds: getCatalogCacheTtlSeconds(),
    });
  } catch (error) {
    logger.warn(
      { err: error, cacheKey: catalogCacheKey(key) },
      "Reference catalog cache write failed; the next read will retry",
    );
  }
  return fresh;
}

async function loadCatalogList(
  store: CatalogReadStore,
): Promise<readonly ReferenceCatalog[]> {
  const rows = await store.loadRows();
  return rows.map(toReferenceCatalog);
}

async function loadCatalog(
  store: CatalogReadStore,
  key: CatalogKey,
): Promise<ReferenceCatalog> {
  const rows = await store.loadRows(key);
  const [row] = rows;
  if (row === undefined) {
    throw new NotFoundError(`Unknown reference catalog: ${key}.`, {
      code: PLATFORM_ERROR_CODE.UNKNOWN_CATALOG,
    });
  }
  return toReferenceCatalog(row);
}

export async function readReferenceCatalogList(
  context: ReferenceReadContext,
): Promise<ReferenceReadResult<ReferenceCatalogList>> {
  const catalogs = await readThroughCatalogCache({
    cache: context.cache,
    catalogKey: null,
    parse: parseCatalogList,
    load: () => loadCatalogList(context.store),
  });
  const payload: ReferenceCatalogList = {
    catalogs: [...catalogs],
    asOf: new Date().toISOString(),
  };
  // The ETag covers the catalog data only: asOf moves on every read, so hashing
  // the whole payload would make every conditional request miss (CT-11).
  return { payload, etag: buildEtag(catalogs) };
}

export async function readReferenceCatalog(
  options: ReadReferenceCatalogOptions,
): Promise<ReferenceReadResult<ReferenceCatalogResponse>> {
  const key = assertCatalogKey(options.catalogKey);
  const catalog = await readThroughCatalogCache({
    cache: options.cache,
    catalogKey: key,
    parse: parseCatalog,
    load: () => loadCatalog(options.store, key),
  });
  const payload: ReferenceCatalogResponse = {
    catalog,
    asOf: new Date().toISOString(),
  };
  return { payload, etag: buildEtag(catalog) };
}
