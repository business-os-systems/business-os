import type { Prisma } from "@suite/db";

/** A catalog item and the version tenants are allowed to read. */
export interface PublishedCatalogItemRef {
  readonly id: string;
  readonly currentVersion: number;
}

export interface PublishedDefinitionRow {
  readonly itemId: string;
  readonly version: number;
  readonly definition: unknown;
}

/** Map key for the (item, version) pair a published definition belongs to. */
export function publishedDefinitionKey(itemId: string, version: number): string {
  return itemId + ":" + String(version);
}

/**
 * Reads the immutable published definition for each item's current version.
 *
 * CmsCatalogItem.definition is the working draft: editing an ACTIVE item writes
 * it there while currentVersion keeps pointing at the last published version.
 * A tenant-facing reader therefore must resolve the definition from
 * CmsCatalogItemVersion, or an unpublished edit would reach every tenant before
 * preview and publish (FR-012, FR-005).
 */
export async function readPublishedDefinitions(
  tx: Prisma.TransactionClient,
  items: readonly PublishedCatalogItemRef[]
): Promise<ReadonlyMap<string, unknown>> {
  if (items.length === 0) {
    return new Map();
  }
  const versions = Array.from(new Set(items.map((item) => item.currentVersion)));
  const rows = await tx.cmsCatalogItemVersion.findMany({
    where: {
      itemId: { in: items.map((item) => item.id) },
      version: { in: versions },
      status: "ACTIVE",
    },
    select: { itemId: true, version: true, definition: true },
  });
  return new Map(
    rows.map((row) => [publishedDefinitionKey(row.itemId, row.version), row.definition])
  );
}
