import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_OWNERSHIP,
  SchemaOwnershipViolation,
  assertTableOwnership,
  registeredSchemas,
} from "../src/schema-registry.js";
import { parsePrismaModels } from "./helpers/prisma-schema.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_DIR = join(PACKAGE_ROOT, "prisma/schema");
const MIGRATIONS_DIR = join(PRISMA_DIR, "migrations");
const CMS_MIGRATION = join(
  MIGRATIONS_DIR,
  "20261111140000_cms_schema_grants_rls/migration.sql",
);

const CMS_TABLES = [
  "cms_sites",
  "cms_site_settings",
  "cms_domains",
  "cms_pages",
  "cms_page_contents",
  "cms_page_versions",
  "cms_page_comments",
  "cms_collections",
  "cms_collection_items",
  "cms_themes",
  "cms_templates",
  "cms_section_templates",
  "cms_site_seo_settings",
  "cms_site_locales",
  "cms_page_translations",
  "cms_url_redirects",
  "cms_site_appearances",
  "cms_inquiries",
  "cms_inquiry_events",
  "cms_site_analytics_daily",
  "cms_plugin_installations",
  "cms_navigation_menus",
  "cms_audit_trails",
  "cms_catalog_items",
  "cms_catalog_item_versions",
] as const;

interface TableIdentity {
  readonly schema: string;
  readonly table: string;
}

function buildTablesByOwner(): Map<string, Set<string>> {
  const byOwner = new Map<string, Set<string>>();
  for (const owner of SCHEMA_OWNERSHIP) {
    const models = parsePrismaModels(join(PRISMA_DIR, owner.prismaFile));
    byOwner.set(owner.owner, new Set(models.map((model) => model.table)));
  }
  return byOwner;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIR, entry.name, "migration.sql"))
    .filter((file) => existsSync(file))
    .sort();
}

function identity(schema: string, table: string): string {
  return schema + "." + table;
}

function recordTable(moved: Map<string, string>, schema: string, table: string): void {
  moved.set(identity(schema, table), identity(schema, table));
}

function recordTableCreations(sql: string, moved: Map<string, string>): void {
  for (const match of sql.matchAll(
    /CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"\."([^"]+)"/g,
  )) {
    const [, schema, table] = match;
    if (schema !== undefined && table !== undefined) {
      recordTable(moved, schema, table);
    }
  }
  for (const match of sql.matchAll(
    /CREATE TABLE (?:IF NOT EXISTS )?(\w+)\."([^"]+)"/g,
  )) {
    const [, schema, table] = match;
    if (schema !== undefined && table !== undefined) {
      recordTable(moved, schema, table);
    }
  }
  for (const match of sql.matchAll(
    /CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"(?!\.)/g,
  )) {
    const table = match[1];
    if (table !== undefined) {
      recordTable(moved, "public", table);
    }
  }
}

/**
 * Applies the schema moves, so a table created in public and moved to cms is
 * remembered by its final schema. Anything short of that would accept a cms
 * table that never reached the cms schema.
 */
function recordMoves(sql: string, moved: Map<string, string>): void {
  for (const match of sql.matchAll(
    /ALTER TABLE (?:IF EXISTS )?"([^"]+)"\."([^"]+)"\s+SET SCHEMA\s+"([^"]+)"/gi,
  )) {
    const [, from, table, target] = match;
    if (from === undefined || table === undefined || target === undefined) {
      continue;
    }
    moved.delete(identity(from, table));
    recordTable(moved, target, table);
  }
  for (const match of sql.matchAll(
    /ALTER TABLE (?:IF EXISTS )?"([^"]+)"\s+SET SCHEMA\s+"([^"]+)"/gi,
  )) {
    const [, table, target] = match;
    if (table === undefined || target === undefined) {
      continue;
    }
    moved.delete(identity("public", table));
    recordTable(moved, target, table);
  }
}

/**
 * Renames inside one schema keep the table's identity and ownership (for
 * example cms_form_submissions -> cms_inquiries in 20261111160000).
 */
function recordRenames(sql: string, moved: Map<string, string>): void {
  for (const match of sql.matchAll(
    /ALTER TABLE\s+"?([a-z_]+)"?\."?([^"]+)"?\s+RENAME TO\s+"?([^"]+)"?/gi,
  )) {
    const [, schema, from, to] = match;
    if (schema === undefined || from === undefined || to === undefined) {
      continue;
    }
    moved.delete(identity(schema, from));
    moved.set(identity(schema, to), schema);
  }
}

/**
 * Final schema per table after replaying the migration history in order.
 *
 * The cms tables are created in public by 20261011181500 and
 * 20261111130000, then moved to cms by 20261111140000. A table therefore
 * belongs to the schema named by its last CREATE, RENAME or SET SCHEMA, never
 * to every schema it has ever occupied.
 */
function createdTables(): TableIdentity[] {
  const moved = new Map<string, string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    recordTableCreations(sql, moved);
    recordMoves(sql, moved);
    recordRenames(sql, moved);
  }
  return [...moved.keys()].map((entry) => {
    const separator = entry.indexOf(".");
    return {
      schema: entry.slice(0, separator),
      table: entry.slice(separator + 1),
    };
  });
}

function createdSchemas(): Set<string> {
  const schemas = new Set<string>(["public"]);
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    for (const match of sql.matchAll(/CREATE SCHEMA (?:IF NOT EXISTS )?"([^"]+)"/g)) {
      schemas.add(match[1] ?? "public");
    }
  }
  return schemas;
}

const tablesByOwner = buildTablesByOwner();
const finalTables = createdTables();

function assertOwned(schema: string, table: string): void {
  assertTableOwnership({ schema, table, tablesByOwner });
}

function expectOwned(schema: string, table: string): void {
  expect(() => assertOwned(schema, table), schema + "." + table).not.toThrow();
}

function expectUnowned(schema: string, table: string): void {
  expect(() => assertOwned(schema, table), schema + "." + table).toThrow(/not owned/);
}

describe("database schema and table-prefix registry", () => {
  it("registers every schema that the migrations create", () => {
    const registered = new Set(registeredSchemas());
    for (const schema of createdSchemas()) {
      expect(registered.has(schema), "Unregistered schema: " + schema).toBe(true);
    }
  });

  it("assigns every Prisma model to a registered schema owner", () => {
    for (const owner of SCHEMA_OWNERSHIP) {
      const models = parsePrismaModels(join(PRISMA_DIR, owner.prismaFile));
      expect(models.length, "No models parsed from " + owner.prismaFile).toBeGreaterThan(0);
      for (const model of models) {
        expect(model.schema, owner.prismaFile + " model " + model.model).toBe(owner.schema);
      }
    }
  });

  it("accepts every table in its final schema", () => {
    expect(finalTables.length).toBeGreaterThan(0);
    for (const table of finalTables) {
      expectOwned(table.schema, table.table);
    }
  });

  it("places every cms table in the cms schema, not in public", () => {
    const finals = new Map(finalTables.map((table) => [table.table, table.schema]));
    for (const table of CMS_TABLES) {
      expect(finals.get(table), "Final schema for " + table).toBe("cms");
    }
    const stranded = finalTables.filter(
      (table) => table.schema === "public" && table.table.startsWith("cms_"),
    );
    expect(stranded).toEqual([]);
  });

  it("keeps cms.prisma and the registry aligned on the cms prefix and schema", () => {
    const cmsOwner = SCHEMA_OWNERSHIP.find((owner) => owner.prismaFile === "cms.prisma");
    expect(cmsOwner?.schema).toBe("cms");
    expect(cmsOwner?.tablePrefix).toBe("cms_");

    const models = parsePrismaModels(join(PRISMA_DIR, "cms.prisma"));
    expect(models).toHaveLength(CMS_TABLES.length);
    for (const model of models) {
      expect(model.table, model.model).toMatch(/^cms_/);
      expect(model.schema, model.model).toBe("cms");
    }
  });

  it("creates no cross-schema foreign key in the cms migration", () => {
    const sql = readFileSync(CMS_MIGRATION, "utf8");
    expect(sql).not.toMatch(/REFERENCES\s+(?:"public"|public)\./);
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "cms_sites_organizationId_fkey"');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "cms_sites_branchId_fkey"');
  });
});

describe("database schema ownership guard: rejection", () => {
  it("fails on an unregistered schema", () => {
    expect(() => assertOwned("tenant_app", "orders")).toThrow(SchemaOwnershipViolation);
  });

  it("fails on a missing modular prefix", () => {
    expectUnowned("public", "orders");
  });

  it("fails when a cms table is left in public or uses an unregistered prefix", () => {
    expectUnowned("public", "cms_pages");
    expectUnowned("cms", "orders");
  });
});

describe("database schema ownership guard: acceptance", () => {
  it("accepts registered cms prefixes", () => {
    for (const table of ["cms_pages", "cms_catalog_items"] as const) {
      expectOwned("cms", table);
    }
  });

  it("accepts declared core, platform and feature-flag tables", () => {
    expectOwned("public", "organizations");
    expectOwned("public", "system_feature_flags");
    expectOwned("platform", "operators");
  });
});

describe("website-builder catalog table ownership", () => {
  it("accepts the catalog tables under the cms schema and prefix", () => {
    for (const table of ["cms_catalog_items", "cms_catalog_item_versions"] as const) {
      expectOwned("cms", table);
    }
  });
});
