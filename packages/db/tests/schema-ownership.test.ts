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

interface TableIdentity {
  readonly schema: string;
  readonly table: string;
}

function createdTables(): TableIdentity[] {
  const tables: TableIdentity[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"\."([^"]+)"/g)) {
      const schema = match[1];
      const table = match[2];
      if (schema !== undefined && table !== undefined) {
        tables.push({ schema, table });
      }
    }
    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"(?!\.)/g)) {
      const table = match[1];
      if (table !== undefined) {
        tables.push({ schema: "public", table });
      }
    }
  }
  return tables;
}

function createdSchemas(): Set<string> {
  const schemas = new Set<string>(["public"]);
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    for (const match of sql.matchAll(/CREATE SCHEMA (?:IF NOT EXISTS )?"([^"]+)"/g)) {
      const schema = match[1];
      if (schema !== undefined) {
        schemas.add(schema);
      }
    }
  }
  return schemas;
}

const tablesByOwner = buildTablesByOwner();

describe("database schema and table-prefix registry", () => {
  it("registers every schema that the migrations create", () => {
    const registered = new Set(registeredSchemas());
    for (const schema of createdSchemas()) {
      expect(registered.has(schema), `Unregistered schema: ${schema}`).toBe(true);
    }
  });

  it("assigns every Prisma model to a registered schema owner", () => {
    for (const owner of SCHEMA_OWNERSHIP) {
      const models = parsePrismaModels(join(PRISMA_DIR, owner.prismaFile));
      expect(models.length, `No models parsed from ${owner.prismaFile}`).toBeGreaterThan(0);
      for (const model of models) {
        expect(model.schema, `${owner.prismaFile} model ${model.model}`).toBe(owner.schema);
      }
    }
  });

  it("accepts every table created by the migrations", () => {
    const tables = createdTables();
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(
        () =>
          assertTableOwnership({
            schema: table.schema,
            table: table.table,
            tablesByOwner,
          }),
        `${table.schema}.${table.table}`,
      ).not.toThrow();
    }
  });
});

describe("database schema ownership guard", () => {
  it("fails on an unregistered schema", () => {
    expect(() =>
      assertTableOwnership({
        schema: "tenant_app",
        table: "orders",
        tablesByOwner,
      }),
    ).toThrow(SchemaOwnershipViolation);
  });

  it("fails on a missing modular prefix", () => {
    expect(() =>
      assertTableOwnership({
        schema: "public",
        table: "orders",
        tablesByOwner,
      }),
    ).toThrow(/not owned/);
  });

  it("accepts a registered prefix and a declared core table", () => {
    expect(() =>
      assertTableOwnership({
        schema: "public",
        table: "cms_pages",
        tablesByOwner,
      }),
    ).not.toThrow();
    expect(() =>
      assertTableOwnership({
        schema: "public",
        table: "system_feature_flags",
        tablesByOwner,
      }),
    ).not.toThrow();
    expect(() =>
      assertTableOwnership({
        schema: "public",
        table: "organizations",
        tablesByOwner,
      }),
    ).not.toThrow();
    expect(() =>
      assertTableOwnership({
        schema: "platform",
        table: "operators",
        tablesByOwner,
      }),
    ).not.toThrow();
  });
});
