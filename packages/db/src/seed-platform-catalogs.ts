/**
 * Idempotent seed for the ten reference catalogs (#249 / T017).
 *
 * The seed is insert-only: it creates missing catalog rows and missing
 * (catalogKey, code) values. It never updates an existing value, so operator
 * edits, operator retirements and labels survive every re-run. Nothing is
 * deleted. Existing rows are identified by the database's unique constraint,
 * and `skipDuplicates` makes a concurrent or repeated run a no-op.
 *
 * Launch content lives in `reference-catalog-seed-data.ts`. Run the CLI as
 * deployment tooling:
 *   pnpm --filter @suite/db exec tsx src/seed-platform-catalogs.ts
 */

import type { Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { prisma } from "./client.js";
import { buildReferenceCatalogSeed } from "./reference-catalog-seed-data.js";

export interface PlatformCatalogSeedClient {
  catalog: {
    createMany(args: {
      data: Prisma.CatalogCreateManyInput[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
  };
  catalogValue: {
    createMany(args: {
      data: Prisma.CatalogValueCreateManyInput[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
  };
}

export interface PlatformCatalogSeedResult {
  readonly catalogsInserted: number;
  readonly catalogsSkipped: number;
  readonly valuesInserted: number;
  readonly valuesSkipped: number;
}

export async function seedPlatformCatalogs(
  client: PlatformCatalogSeedClient,
): Promise<PlatformCatalogSeedResult> {
  const seed = buildReferenceCatalogSeed();

  const catalogRows: Prisma.CatalogCreateManyInput[] = seed.catalogs.map((catalog) => ({
    key: catalog.key,
    label: catalog.label,
    description: catalog.description,
    isSystem: catalog.isSystem,
  }));
  const catalogs = await client.catalog.createMany({
    data: catalogRows,
    skipDuplicates: true,
  });

  const valueRows: Prisma.CatalogValueCreateManyInput[] = seed.groups.flatMap((group) =>
    group.values.map((value) => ({
      catalogKey: value.catalogKey,
      code: value.code,
      label: value.label,
      sortOrder: value.sortOrder,
      isActive: value.isActive,
      metadata: value.metadata,
      version: value.version,
      createdBy: value.createdBy,
      updatedBy: value.updatedBy,
    })),
  );
  const values = await client.catalogValue.createMany({
    data: valueRows,
    skipDuplicates: true,
  });

  return {
    catalogsInserted: catalogs.count,
    catalogsSkipped: catalogRows.length - catalogs.count,
    valuesInserted: values.count,
    valuesSkipped: valueRows.length - values.count,
  };
}

async function runCatalogSeed(): Promise<void> {
  const result = await seedPlatformCatalogs(prisma);
  process.stdout.write(
    `Reference catalogs seeded: ${result.catalogsInserted} catalog rows inserted, ${result.valuesInserted} values inserted, ${result.valuesSkipped} already present.\n`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  runCatalogSeed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error("Reference catalog seed failed:", error);
      await prisma.$disconnect();
      process.exitCode = 1;
    });
}
