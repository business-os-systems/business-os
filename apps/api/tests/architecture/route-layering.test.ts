import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTES_ROOT = fileURLToPath(new URL("../../src/routes", import.meta.url));
const RESTRICTED_MODULES = ["@suite/db", "@suite/redis"] as const;

function importsDataLayer(source: string): boolean {
  return RESTRICTED_MODULES.some((moduleName) =>
    source.includes(`"${moduleName}"`) || source.includes(`'${moduleName}'`) ||
    source.includes(`"${moduleName}/`) || source.includes(`'${moduleName}/`)
  );
}

function routeSourceFiles(): string[] {
  return readdirSync(ROUTES_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(ROUTES_ROOT, entry));
}

describe("route transport layer", () => {
  it("imports neither the ORM nor the cache client", () => {
    const offenders = routeSourceFiles()
      .filter((file) => importsDataLayer(readFileSync(file, "utf8")))
      .map((file) => relative(ROUTES_ROOT, file));

    expect(offenders).toEqual([]);
    expect(routeSourceFiles().length).toBeGreaterThan(0);
  });
});
