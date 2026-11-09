import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DASHBOARD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTE_DIRECTORY = path.join(DASHBOARD_ROOT, "src/app/api");
const SERVER_COMPONENT_DIRECTORY = path.join(DASHBOARD_ROOT, "src/app/(dashboard)");

const DB_MODULE = "@suite/db";
const CACHE_MODULE = "@suite/redis";
const IMPORT_MARKERS = ["import", "require"];

function collectSourceFiles(directory: string, extensions: readonly string[]): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(absolutePath, extensions);
    }
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [absolutePath] : [];
  });
}

function lineImportsModule(line: string, moduleName: string): boolean {
  if (!IMPORT_MARKERS.some((marker) => line.includes(marker))) {
    return false;
  }
  return [`"${moduleName}"`, `'${moduleName}'`, `"${moduleName}/`, `'${moduleName}/`].some(
    (specifier) => line.includes(specifier)
  );
}

function findOffenders(
  directory: string,
  extensions: readonly string[],
  moduleName: string
): string[] {
  return collectSourceFiles(directory, extensions)
    .filter((filePath) =>
      fs
        .readFileSync(filePath, "utf8")
        .split("\n")
        .some((line) => lineImportsModule(line, moduleName))
    )
    .map((filePath) => path.relative(DASHBOARD_ROOT, filePath));
}

describe("dashboard data boundary", () => {
  it("keeps the ORM out of every route handler under app/api", () => {
    const offenders = findOffenders(ROUTE_DIRECTORY, [".ts", ".tsx"], DB_MODULE);
    expect(
      offenders,
      `Route handlers must call a service in src/services instead of importing @suite/db.\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("keeps the ORM out of every dashboard server component under app/(dashboard)", () => {
    const offenders = findOffenders(SERVER_COMPONENT_DIRECTORY, [".tsx"], DB_MODULE);
    expect(
      offenders,
      `Server components must call a service in src/services instead of importing @suite/db.\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("keeps the cache client out of every route handler under app/api", () => {
    const offenders = findOffenders(ROUTE_DIRECTORY, [".ts", ".tsx"], CACHE_MODULE);
    expect(
      offenders,
      `Route handlers must call a service in src/services instead of importing @suite/redis.\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
