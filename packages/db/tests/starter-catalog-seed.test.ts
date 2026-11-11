import type { Prisma } from "@prisma/client";
import { CmsCatalogKind, CmsCatalogScope, CmsCatalogStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { buildReferenceCatalogSeed } from "../src/reference-catalog-seed-data.js";
import {
  runStarterCatalogSeed,
  runStarterCatalogSeedCli,
  seedStarterCatalog,
  toCatalogJsonValue,
  type StarterCatalogCliClient,
  type StarterCatalogSeedClient,
  type StarterCatalogSeedResult,
  type StarterCatalogTransactionOptions,
  type StarterCatalogTransactionRunner,
} from "../src/seed-starter-catalog.js";
import {
  STARTER_APPEARANCE_TOKEN_KEYS,
  STARTER_CATALOG_ACTOR,
  STARTER_CATALOG_CONTRACT_VERSION,
  STARTER_SECTION_BLOCK_TYPES,
  buildStarterCatalogSeed,
  starterCatalogItemId,
  starterCatalogVersionId,
  type StarterCatalogItem,
  type StarterCatalogSectionItem,
  type StarterCatalogSeed,
} from "../src/starter-catalog-seed-data.js";

const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ENABLED = Boolean(process.env.DATABASE_URL);
const ROLLBACK_SENTINEL = new Error("rollback the starter catalog seed test transaction");

const COLOUR_TOKEN_KEYS = new Set([
  "colorBackground",
  "colorSurface",
  "colorText",
  "colorTextMuted",
  "colorPrimary",
  "colorPrimaryContrast",
  "colorAccent",
  "colorBorder",
]);
const LENGTH_TOKEN_KEYS = new Set(["radiusSm", "radiusMd", "radiusLg", "spaceSection"]);
const FONT_TOKEN_KEYS = new Set(["fontHeading", "fontBody"]);
const LENGTH_UNITS = ["px", "rem", "em"] as const;
const FORBIDDEN_DEFINITION_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const CATALOG_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function isDigit(value: string): boolean {
  return [...value].every((character) => character >= "0" && character <= "9");
}

/** Mirrors the theme token length rule without a backtracking regular expression. */
function isLengthToken(value: string): boolean {
  if (value === "0") {
    return true;
  }
  const unit = LENGTH_UNITS.find((candidate) => value.endsWith(candidate));
  if (unit === undefined) {
    return false;
  }
  const numeric = value.slice(0, -unit.length);
  const parts = numeric.split(".");
  return parts.length <= 2 && parts.every((part) => part.length > 0 && isDigit(part));
}

function collectIds(value: unknown, ids: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectIds(entry, ids);
    }
    return ids;
  }
  if (typeof value !== "object" || value === null) {
    return ids;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "id" && typeof entry === "string") {
      ids.push(entry);
    }
    collectIds(entry, ids);
  }
  return ids;
}

function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      assertNoForbiddenKeys(entry);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    expect(FORBIDDEN_DEFINITION_KEYS.has(key), key).toBe(false);
    assertNoForbiddenKeys(entry);
  }
}

function requireSeedItem(seed: StarterCatalogSeed, itemId: string): StarterCatalogItem {
  const item = seed.items.find((candidate) => candidate.id === itemId);
  if (item === undefined) {
    throw new Error("The starter catalog seed lost item " + itemId + ".");
  }
  return item;
}

function requireFirstSection(seed: StarterCatalogSeed): StarterCatalogSectionItem {
  const section = seed.sections[0];
  if (section === undefined) {
    throw new Error("The starter catalog seed has no sections.");
  }
  return section;
}

function starterIds(seed: StarterCatalogSeed): string[] {
  return seed.items.map((item) => item.id);
}

async function clearStarterRows(
  tx: Prisma.TransactionClient,
  seed: StarterCatalogSeed,
): Promise<void> {
  const ids = starterIds(seed);
  await tx.cmsCatalogItemVersion.deleteMany({ where: { itemId: { in: ids } } });
  await tx.cmsCatalogItem.deleteMany({ where: { id: { in: ids } } });
}

async function inRollbackTransaction<T>(
  test: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let captured: { value: T } | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        captured = { value: await test(tx) };
        throw ROLLBACK_SENTINEL;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error !== ROLLBACK_SENTINEL) {
      throw error;
    }
  }
  if (captured === undefined) {
    throw new Error("The starter catalog seed test transaction did not complete.");
  }
  return captured.value;
}

async function withClearedStarterCatalog<T>(
  scenario: (tx: Prisma.TransactionClient, seed: StarterCatalogSeed) => Promise<T>,
): Promise<T> {
  const seed = buildStarterCatalogSeed();
  return inRollbackTransaction(async (tx) => {
    await clearStarterRows(tx, seed);
    return scenario(tx, seed);
  });
}

async function withSeededStarterCatalog<T>(
  scenario: (tx: Prisma.TransactionClient, seed: StarterCatalogSeed) => Promise<T>,
): Promise<T> {
  return withClearedStarterCatalog(async (tx, seed) => {
    await seedStarterCatalog(tx);
    return scenario(tx, seed);
  });
}

function rollbackTransactionRunner(
  prepare: (tx: Prisma.TransactionClient) => Promise<void>,
  optionsSeen: StarterCatalogTransactionOptions[],
): StarterCatalogTransactionRunner {
  return {
    async $transaction<T>(
      fn: (tx: StarterCatalogSeedClient) => Promise<T>,
      options: StarterCatalogTransactionOptions,
    ): Promise<T> {
      optionsSeen.push(options);
      return inRollbackTransaction(async (tx) => {
        await prepare(tx);
        return fn(tx);
      });
    },
  };
}

async function createOperatorOwnedSection(
  tx: Prisma.TransactionClient,
  conflict: StarterCatalogSectionItem,
): Promise<string> {
  const operatorId = "cmscat_operator_" + RUN + "_" + conflict.slug;
  await tx.cmsCatalogItem.create({
    data: {
      id: operatorId,
      kind: CmsCatalogKind.SECTION,
      scope: CmsCatalogScope.GLOBAL,
      organizationId: null,
      name: "Operator owned section",
      slug: conflict.slug,
      category: conflict.category,
      industries: [...conflict.industries],
      definition: {
        schemaVersion: STARTER_CATALOG_CONTRACT_VERSION,
        block: { id: "blk_operator", type: "hero", props: { headline: "Operator hero" } },
      },
      status: CmsCatalogStatus.DRAFT,
      currentVersion: 0,
      draftVersion: 1,
      createdBy: "operator:test",
      updatedBy: "operator:test",
    },
  });
  return operatorId;
}

describe("starter catalog composition", () => {
  it("ships the eight launch sections plus one template and one theme", () => {
    const seed = buildStarterCatalogSeed();

    expect(seed.sections).toHaveLength(STARTER_SECTION_BLOCK_TYPES.length);
    expect(seed.sections.map((item) => item.definition.block.type).sort()).toEqual(
      [...STARTER_SECTION_BLOCK_TYPES].sort(),
    );
    expect(seed.items.filter((item) => item.kind === CmsCatalogKind.TEMPLATE)).toHaveLength(1);
    expect(seed.items.filter((item) => item.kind === CmsCatalogKind.THEME)).toHaveLength(1);
    expect(seed.items).toHaveLength(10);
    expect(seed.template.kind).toBe(CmsCatalogKind.TEMPLATE);
    expect(seed.theme.kind).toBe(CmsCatalogKind.THEME);
  });

  it("keeps identities, slugs and definitions deterministic", () => {
    const first = buildStarterCatalogSeed();
    const second = buildStarterCatalogSeed();

    expect(second).toEqual(first);

    const ids = starterIds(first);
    expect(new Set(ids).size).toBe(ids.length);
    const slugKeys = first.items.map((item) => item.kind + ":" + item.slug);
    expect(new Set(slugKeys).size).toBe(slugKeys.length);

    for (const item of first.items) {
      expect(item.id).toBe(starterCatalogItemId(item.slug));
      expect(item.slug).toMatch(CATALOG_SLUG);
      expect(item.id.length).toBeLessThanOrEqual(64);
    }
    const firstSection = requireFirstSection(first);
    expect(starterCatalogVersionId(firstSection.slug)).toBe(firstSection.id + "_v1");
  });

  it("refuses a definition value that cannot be stored as JSON", () => {
    expect(() => toCatalogJsonValue(undefined)).toThrow(/cannot be stored as JSON/);
  });

  it("refuses a slug that cannot become a stable catalog identity", () => {
    expect(() => starterCatalogItemId("Not A Slug")).toThrow(/not a lower-case catalog slug/);
  });
});

describe("starter catalog classification", () => {
  it("classifies every item by use case and a reference industry", () => {
    const seed = buildStarterCatalogSeed();
    const industryGroup = buildReferenceCatalogSeed().groups.find(
      (group) => group.key === "industry_category",
    );
    const knownIndustries = new Set((industryGroup?.values ?? []).map((value) => value.code));

    expect(knownIndustries.size).toBeGreaterThan(0);
    for (const item of seed.items) {
      expect(item.category).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
      expect(item.industries.length).toBeGreaterThan(0);
      for (const industry of item.industries) {
        expect(knownIndustries.has(industry), industry).toBe(true);
      }
    }
  });
});

describe("starter catalog section definitions", () => {
  it("keeps every section inside the 2026-03 catalog contract", () => {
    const seed = buildStarterCatalogSeed();

    for (const item of seed.sections) {
      expect(item.definition.schemaVersion).toBe(STARTER_CATALOG_CONTRACT_VERSION);
      expect(STARTER_SECTION_BLOCK_TYPES).toContain(item.definition.block.type);
      expect(item.definition.block.id.trim().length).toBeGreaterThan(0);
      assertNoForbiddenKeys(item.definition);

      const ids = collectIds(item.definition);
      expect(new Set(ids).size, item.slug).toBe(ids.length);
    }
  });
});

describe("starter catalog template definition", () => {
  it("ships a template whose pages satisfy the page AST contract", () => {
    const seed = buildStarterCatalogSeed();
    const definition = seed.template.definition;

    expect(definition.schemaVersion).toBe(STARTER_CATALOG_CONTRACT_VERSION);
    expect(definition.pages.length).toBeGreaterThanOrEqual(1);
    expect(definition.pages.length).toBeLessThanOrEqual(20);

    for (const page of definition.pages) {
      const pageTitle = page.meta?.title.trim() ?? "";
      expect(page.version).toBe(1);
      expect(page.schemaVersion).toBe(STARTER_CATALOG_CONTRACT_VERSION);
      expect(pageTitle.length).toBeGreaterThan(0);
      expect(page.sections.length).toBeGreaterThan(0);
      const ids = collectIds(page);
      expect(new Set(ids).size, pageTitle).toBe(ids.length);

      for (const section of page.sections) {
        expect(section.blocks.length).toBeGreaterThan(0);
        for (const block of section.blocks) {
          expect(STARTER_SECTION_BLOCK_TYPES).toContain(block.type);
        }
      }
    }
    assertNoForbiddenKeys(definition);
  });
});

describe("starter catalog theme definition", () => {
  it("ships a complete theme with valid appearance tokens", () => {
    const seed = buildStarterCatalogSeed();
    const definition = seed.theme.definition;

    expect(definition.schemaVersion).toBe(STARTER_CATALOG_CONTRACT_VERSION);
    expect(Object.keys(definition.tokens).sort()).toEqual(
      [...STARTER_APPEARANCE_TOKEN_KEYS].sort(),
    );
    assertNoForbiddenKeys(definition);

    for (const key of STARTER_APPEARANCE_TOKEN_KEYS) {
      const value = definition.tokens[key];
      if (COLOUR_TOKEN_KEYS.has(key)) {
        expect(value, key).toMatch(HEX_COLOUR);
        continue;
      }
      if (LENGTH_TOKEN_KEYS.has(key)) {
        expect(isLengthToken(value), key).toBe(true);
        continue;
      }
      if (FONT_TOKEN_KEYS.has(key)) {
        expect(value.trim().length, key).toBeGreaterThan(0);
      }
    }
    expect(definition.tokens.shadowCard.length).toBeGreaterThan(0);
  });
});

async function readSeededItems(tx: Prisma.TransactionClient, ids: readonly string[]) {
  return tx.cmsCatalogItem.findMany({
    where: { id: { in: [...ids] } },
    include: { versions: { orderBy: { version: "asc" } } },
  });
}

type SeededRow = Awaited<ReturnType<typeof readSeededItems>>[number];

interface SeededRowSnapshot {
  readonly result: StarterCatalogSeedResult;
  readonly items: readonly SeededRow[];
}

function expectPublishedItem(row: SeededRow, expected: StarterCatalogItem): void {
  expect(row.kind).toBe(expected.kind);
  expect(row.scope).toBe(CmsCatalogScope.GLOBAL);
  expect(row.organizationId).toBeNull();
  expect(row.targeting).toEqual({});
  expect(row.status).toBe(CmsCatalogStatus.ACTIVE);
  expect(row.currentVersion).toBe(1);
  expect(row.draftVersion).toBeNull();
  expect(row.contractVersion).toBe(STARTER_CATALOG_CONTRACT_VERSION);
  expect(row.createdBy).toBe(STARTER_CATALOG_ACTOR);
  expect(row.updatedBy).toBe(STARTER_CATALOG_ACTOR);
  expect(row.publishedAt).not.toBeNull();
  expect(row.definition).toEqual(expected.definition);
  expect(row.versions).toHaveLength(1);

  const version = row.versions[0];
  expect(version?.version).toBe(1);
  expect(version?.status).toBe(CmsCatalogStatus.ACTIVE);
  expect(version?.contractVersion).toBe(STARTER_CATALOG_CONTRACT_VERSION);
  expect(version?.definition).toEqual(expected.definition);
  expect(version?.publishedBy).toBe(STARTER_CATALOG_ACTOR);
  expect(version?.createdBy).toBe(STARTER_CATALOG_ACTOR);
  expect(version?.publishedAt).not.toBeNull();
  expect(version?.id).toBe(starterCatalogVersionId(expected.slug));
}

describe.skipIf(!ENABLED)("starter catalog seed rows", () => {
  it("creates every item ACTIVE with one immutable published version", async () => {
    const snapshot: SeededRowSnapshot = await withClearedStarterCatalog(async (tx, seed) => {
      const result = await seedStarterCatalog(tx);
      const items = await readSeededItems(tx, starterIds(seed));
      return { result, items };
    });

    const seed = buildStarterCatalogSeed();
    expect(snapshot.result.itemsInserted).toBe(seed.items.length);
    expect(snapshot.result.itemsSkipped).toBe(0);
    expect(snapshot.result.versionsInserted).toBe(seed.items.length);
    expect(snapshot.items).toHaveLength(seed.items.length);

    for (const row of snapshot.items) {
      expectPublishedItem(row, requireSeedItem(seed, row.id));
    }
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog tenant read contract", () => {
  it("meets the tenant Add section drawer read contract", async () => {
    const drawer = await withSeededStarterCatalog(async (tx, seed) => {
      const rows = await tx.cmsCatalogItem.findMany({
        where: {
          kind: CmsCatalogKind.SECTION,
          status: CmsCatalogStatus.ACTIVE,
          currentVersion: { gt: 0 },
          OR: [
            { scope: CmsCatalogScope.GLOBAL, organizationId: null },
            { scope: CmsCatalogScope.TENANT, organizationId: "org_starter_" + RUN },
          ],
        },
        select: { id: true, name: true, slug: true, currentVersion: true, targeting: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const versions = await tx.cmsCatalogItemVersion.findMany({
        where: {
          itemId: { in: rows.map((row) => row.id) },
          status: CmsCatalogStatus.ACTIVE,
        },
        select: { itemId: true, version: true, definition: true },
      });
      return { seed, rows, versions };
    });

    expect(drawer.rows).toHaveLength(drawer.seed.sections.length);
    expect(drawer.rows.map((row) => row.name).sort()).toEqual(
      drawer.seed.sections.map((item) => item.name).sort(),
    );

    for (const row of drawer.rows) {
      expect(row.targeting).toEqual({});
      const published = drawer.versions.find(
        (version) => version.itemId === row.id && version.version === row.currentVersion,
      );
      expect(published, row.slug).toBeDefined();
    }
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog seed idempotency", () => {
  it("re-runs without inserting, duplicating or overwriting operator edits", async () => {
    const outcome = await withClearedStarterCatalog(async (tx, seed) => {
      const first = await seedStarterCatalog(tx);
      const second = await seedStarterCatalog(tx);
      const hero = requireFirstSection(seed);
      await tx.cmsCatalogItem.update({
        where: { id: hero.id },
        data: { name: "Operator Hero", category: "operator" },
      });
      const third = await seedStarterCatalog(tx);
      const stored = await tx.cmsCatalogItem.findUnique({
        where: { id: hero.id },
        select: { name: true, category: true },
      });
      const rows = await tx.cmsCatalogItem.findMany({
        where: { id: { in: starterIds(seed) } },
        select: { kind: true, slug: true },
      });
      return { first, second, third, stored, rows };
    });

    const seed = buildStarterCatalogSeed();
    expect(outcome.first.itemsInserted).toBe(seed.items.length);
    expect(outcome.first.versionsInserted).toBe(seed.items.length);
    expect(outcome.second.itemsInserted).toBe(0);
    expect(outcome.second.versionsInserted).toBe(0);
    expect(outcome.second.itemsSkipped).toBe(seed.items.length);
    expect(outcome.third.itemsInserted).toBe(0);
    expect(outcome.stored?.name).toBe("Operator Hero");
    expect(outcome.stored?.category).toBe("operator");

    const slugKeys = outcome.rows.map((row) => row.kind + ":" + row.slug);
    expect(new Set(slugKeys).size).toBe(slugKeys.length);
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog seed slug conflicts", () => {
  it("skips a slug an operator already owns instead of duplicating it", async () => {
    const seed = buildStarterCatalogSeed();
    const conflict = requireFirstSection(seed);

    const outcome = await withClearedStarterCatalog(async (tx) => {
      const operatorId = await createOperatorOwnedSection(tx, conflict);
      const result = await seedStarterCatalog(tx);
      const rows = await tx.cmsCatalogItem.findMany({
        where: {
          kind: CmsCatalogKind.SECTION,
          scope: CmsCatalogScope.GLOBAL,
          organizationId: null,
          slug: conflict.slug,
        },
        select: { id: true, name: true },
      });
      return { result, rows, operatorId };
    });

    expect(outcome.result.itemsInserted).toBe(seed.items.length - 1);
    expect(outcome.result.slugsSkipped).toContain(conflict.slug);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]?.id).toBe(outcome.operatorId);
    expect(outcome.rows[0]?.name).toBe("Operator owned section");
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog seed runner counts", () => {
  it("runs the seed in one transaction and reports the inserted counts", async () => {
    const seed = buildStarterCatalogSeed();
    const lines: string[] = [];
    const warnings: string[] = [];
    const optionsSeen: StarterCatalogTransactionOptions[] = [];
    const runner = rollbackTransactionRunner(async (tx) => clearStarterRows(tx, seed), optionsSeen);

    const result = await runStarterCatalogSeed(
      runner,
      (line) => lines.push(line),
      (line) => warnings.push(line),
    );

    expect(result.itemsInserted).toBe(seed.items.length);
    expect(result.versionsInserted).toBe(seed.items.length);
    expect(optionsSeen).toEqual([{ timeout: 60_000, maxWait: 10_000 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(String(seed.items.length) + " items");
    expect(warnings).toEqual([]);
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog seed runner warnings", () => {
  it("reports an operator-owned slug instead of failing", async () => {
    const seed = buildStarterCatalogSeed();
    const conflict = requireFirstSection(seed);
    const warnings: string[] = [];
    const runner = rollbackTransactionRunner(async (tx) => {
      await clearStarterRows(tx, seed);
      await createOperatorOwnedSection(tx, conflict);
    }, []);

    const result = await runStarterCatalogSeed(
      runner,
      () => undefined,
      (line) => warnings.push(line),
    );

    expect(result.itemsInserted).toBe(seed.items.length - 1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(conflict.slug);
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog seed CLI success", () => {
  it("disconnects after printing the outcome", async () => {
    const seed = buildStarterCatalogSeed();
    const lines: string[] = [];
    let disconnects = 0;
    const runner = rollbackTransactionRunner(async (tx) => clearStarterRows(tx, seed), []);
    const client: StarterCatalogCliClient = {
      $transaction: <T>(
        fn: (tx: StarterCatalogSeedClient) => Promise<T>,
        options: StarterCatalogTransactionOptions,
      ): Promise<T> => runner.$transaction(fn, options),
      $disconnect: () => {
        disconnects += 1;
        return Promise.resolve();
      },
    };

    await runStarterCatalogSeedCli(client, {
      writeLine: (line) => lines.push(line),
      writeWarning: () => undefined,
      writeError: () => {
        throw new Error("The seed should not have failed.");
      },
      markFailed: () => {
        throw new Error("The seed should not have been marked failed.");
      },
    });

    expect(lines).toHaveLength(1);
    expect(disconnects).toBe(1);
  }, 60_000);
});

describe.skipIf(!ENABLED)("starter catalog seed CLI failure", () => {
  it("reports the failure, marks it and still disconnects", async () => {
    const errors: unknown[] = [];
    let failures = 0;
    let disconnects = 0;
    const client: StarterCatalogCliClient = {
      $transaction: () => Promise.reject(new Error("database down")),
      $disconnect: () => {
        disconnects += 1;
        return Promise.resolve();
      },
    };

    await runStarterCatalogSeedCli(client, {
      writeLine: () => {
        throw new Error("No line should be written.");
      },
      writeWarning: () => undefined,
      writeError: (error) => errors.push(error),
      markFailed: () => {
        failures += 1;
      },
    });

    expect(errors).toHaveLength(1);
    expect(failures).toBe(1);
    expect(disconnects).toBe(1);
  });
});
