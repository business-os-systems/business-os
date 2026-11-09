import { createHash } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE, isCatalogKey, type CatalogKey } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import {
  catalogMetadataSchema,
  referenceCatalogSchema,
  type ReferenceCatalog,
  type ReferenceCatalogList,
  type ReferenceCatalogResponse,
} from "./reference-read.contract.js";

/**
 * Reference read service (FR-105, FR-112, CT-7).
 *
 * The Platform database identity reads the control-plane reference tables
 * because this route also serves the operator control session; the tenant
 * identity reads the granted active-values view instead. The returned DTO is a
 * whitelisted projection, never a Prisma row. Retired values are filtered in
 * the query so a retired code can never be selected again (FR-104).
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

export async function readReferenceCatalogList(
  prisma: PrismaClient,
): Promise<ReferenceReadResult<ReferenceCatalogList>> {
  const rows = await loadCatalogRows(prisma);
  const payload: ReferenceCatalogList = {
    catalogs: rows.map(toReferenceCatalog),
    asOf: new Date().toISOString(),
  };
  // The ETag covers the catalog data only: asOf moves on every read, so hashing
  // the whole payload would make every conditional request miss (CT-11).
  return { payload, etag: buildEtag(payload.catalogs) };
}

export async function readReferenceCatalog(
  prisma: PrismaClient,
  catalogKey: string,
): Promise<ReferenceReadResult<ReferenceCatalogResponse>> {
  const key = assertCatalogKey(catalogKey);
  const rows = await loadCatalogRows(prisma, key);
  const [row] = rows;
  if (row === undefined) {
    throw new NotFoundError(`Unknown reference catalog: ${catalogKey}.`, {
      code: PLATFORM_ERROR_CODE.UNKNOWN_CATALOG,
    });
  }
  const payload: ReferenceCatalogResponse = {
    catalog: toReferenceCatalog(row),
    asOf: new Date().toISOString(),
  };
  return { payload, etag: buildEtag(payload.catalog) };
}
