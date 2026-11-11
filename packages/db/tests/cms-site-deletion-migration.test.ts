import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/index.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(PACKAGE_ROOT, "prisma/schema/cms.prisma");
const MIGRATION = join(
  PACKAGE_ROOT,
  "prisma/schema/migrations/20261112010000_cms_site_deletion_lifecycle/migration.sql",
);
const enabled = Boolean(process.env.DATABASE_URL);

describe("cms site deletion lifecycle migration (FR-097, DB-5)", () => {
  it("declares the lifecycle columns on the cms-owned site model", () => {
    const schema = readFileSync(SCHEMA, "utf8");
    expect(schema).toContain("deletionFlaggedAt");
    expect(schema).toContain("deletionConfirmedAt");
    expect(schema).toContain("deletionConfirmedBy");
    expect(schema).toContain("@@index([deletionFlaggedAt])");
  });

  it("is forward-only, sets lock_timeout and adds the flag index", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("SET lock_timeout");
    expect(sql).toContain("'5s'");
    expect(sql).toContain('"deletionFlaggedAt"');
    expect(sql).toContain('"deletionConfirmedAt"');
    expect(sql).toContain('"deletionConfirmedBy"');
    expect(sql).toContain("cms_sites_deletionFlaggedAt_idx");
    expect(sql).not.toContain("DROP COLUMN");
  });

  it.skipIf(!enabled)("applies the columns to the live cms_sites table", async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT "column_name"
        FROM "information_schema"."columns"
       WHERE "table_schema" = 'cms'
         AND "table_name" = 'cms_sites'
         AND "column_name" IN (
           'deletionFlaggedAt',
           'deletionConfirmedAt',
           'deletionConfirmedBy'
         )
    `;
    expect(rows.map((row) => row.column_name).sort()).toEqual([
      "deletionConfirmedAt",
      "deletionConfirmedBy",
      "deletionFlaggedAt",
    ]);
  });
});

afterAll(async () => {
  if (enabled) {
    await prisma.$disconnect();
  }
});
