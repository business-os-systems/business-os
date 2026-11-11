import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as runtime from "../src/index.js";
import { InMemoryStorageAdapter } from "../src/testing/in-memory-storage-adapter.js";

const REACT_ENTRY = join(process.cwd(), "src/react/index.ts");

/**
 * Modules a browser bundle must never reach through @suite/media/react. The
 * database client and object-storage SDK are server-only concerns.
 */
const SERVER_ONLY_IMPORT_PREFIXES = [
  "@suite/db",
  "@suite/redis",
  "@suite/logger",
  "@aws-sdk",
  "next",
  "@/",
  "apps/",
  "node:",
] as const;

function isServerOnlySpecifier(specifier: string): boolean {
  return SERVER_ONLY_IMPORT_PREFIXES.some((prefix) =>
    prefix.endsWith(":") || prefix.endsWith("/")
      ? specifier.startsWith(prefix)
      : specifier === prefix || specifier.startsWith(`${prefix}/`)
  );
}

const TYPE_ONLY_IMPORT_STATEMENT =
  /(?:import|export)\s+type\s[\s\S]*?from\s*["'][^"']+["'];?/g;
const MODULE_SPECIFIER = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

function collectModuleSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8").replace(TYPE_ONLY_IMPORT_STATEMENT, "");
  const specifiers: string[] = [];
  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function resolveRelativeModule(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  const candidate = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(
    (path) => existsSync(path)
  );
  return candidate ?? null;
}

function findServerOnlyImports(file: string): string[] {
  return collectModuleSpecifiers(file)
    .filter(isServerOnlySpecifier)
    .map((specifier) => `${relative(process.cwd(), file)} imports ${specifier}`);
}

function collectServerOnlyImports(files: readonly string[]): string[] {
  return files.flatMap(findServerOnlyImports);
}

function collectRelativeDependencies(file: string): string[] {
  const dependencies: string[] = [];
  for (const specifier of collectModuleSpecifiers(file)) {
    const dependency = resolveRelativeModule(specifier, file);
    if (dependency !== null) {
      dependencies.push(dependency);
      continue;
    }
    if (specifier.startsWith(".")) {
      throw new Error(`Unresolved relative import "${specifier}" in ${file}.`);
    }
  }
  return dependencies;
}

function collectReachableModules(entry: string): string[] {
  const visited = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || visited.has(file)) {
      continue;
    }
    visited.add(file);
    pending.push(...collectRelativeDependencies(file));
  }
  return [...visited];
}

describe("runtime and test storage boundary", () => {
  it("never exports the in-memory adapter from the runtime barrel", () => {
    const runtimeExports = runtime as Record<string, unknown>;
    expect(runtimeExports.InMemoryStorageAdapter).toBeUndefined();
    expect(
      Object.keys(runtimeExports).some((name) => name.includes("InMemory"))
    ).toBe(false);
  });

  it("keeps the test adapter deterministic and checksum-aware", async () => {
    const storage = new InMemoryStorageAdapter();
    const first = await storage.createUploadUrl({
      storageKey: "media/org_1/2026/01/abc.png",
      mimeType: "image/png",
      sizeBytes: 1_024,
      checksumHex: "a".repeat(64),
      fileName: "room.png",
    });
    const second = await storage.createUploadUrl({
      storageKey: "media/org_1/2026/01/abc.png",
      mimeType: "image/png",
      sizeBytes: 1_024,
      checksumHex: "a".repeat(64),
      fileName: "room.png",
    });
    expect(first.uploadUrl).toBe(second.uploadUrl);

    storage.putObject({
      storageKey: "media/org_1/2026/01/abc.png",
      mimeType: "image/png",
      sizeBytes: 1_024,
      checksumHex: "a".repeat(64),
      fileName: "room.png",
    });
    const head = await storage.headObject("media/org_1/2026/01/abc.png");
    expect(head?.checksumHex).toBe("a".repeat(64));
    await storage.removeObject("media/org_1/2026/01/abc.png");
    expect(await storage.headObject("media/org_1/2026/01/abc.png")).toBeNull();
  });

  it("never reaches a server-only layer from the React subpath", () => {
    const reachable = collectReachableModules(REACT_ENTRY);
    expect(reachable.length).toBeGreaterThan(5);
    expect(reachable.some((file) => file.endsWith("/src/constants.ts"))).toBe(
      true
    );

    expect(collectServerOnlyImports(reachable)).toEqual([]);
  });
});
