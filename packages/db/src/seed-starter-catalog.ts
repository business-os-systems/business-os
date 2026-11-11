import { CmsCatalogScope, CmsCatalogStatus, type Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { prisma } from "./client.js";
import {
  STARTER_CATALOG_ACTOR,
  STARTER_CATALOG_CONTRACT_VERSION,
  STARTER_CATALOG_VERSION_NUMBER,
  buildStarterCatalogSeed,
  starterCatalogVersionId,
  type StarterCatalogItem,
  type StarterCatalogSeed,
} from "./starter-catalog-seed-data.js";

/**
 * Idempotent starter catalog seed (#372, F10, T141).
 *
 * The seed is insert-only. It creates the items and published versions that do
 * not exist and skips everything else, so operator edits, lifecycle transitions
 * and re-runs are never overwritten. A slug an operator already owns is left
 * untouched and reported instead of duplicated. Nothing is deleted.
 *
 * Every seeded item is ACTIVE with one immutable published version behind its
 * currentVersion, which is exactly what the tenant Add section drawer and the
 * create-site path read (FR-008, FR-012, FR-016).
 *
 * Run it through the package script, which wraps the whole seed in one
 * transaction:
 *   pnpm --filter @suite/db db:seed:starter-catalog
 *
 * The Human Seeding Gate applies: run it on a shared database only with the
 * operator approval documented in docs/website-builder/catalog-authoring.md.
 */

export type StarterCatalogSeedClient = Pick<
  Prisma.TransactionClient,
  "cmsCatalogItem" | "cmsCatalogItemVersion"
>;

export interface StarterCatalogSeedResult {
  readonly itemsInserted: number;
  readonly itemsSkipped: number;
  readonly versionsInserted: number;
  /** Slugs an operator already owns; the seed did not touch those rows. */
  readonly slugsSkipped: readonly string[];
}

async function findItemId(
  client: StarterCatalogSeedClient,
  itemId: string,
): Promise<string | null> {
  const row = await client.cmsCatalogItem.findFirst({
    where: { id: itemId },
    select: { id: true },
  });
  return row === null ? null : row.id;
}

async function findGlobalSlugOwner(
  client: StarterCatalogSeedClient,
  item: StarterCatalogItem,
): Promise<string | null> {
  const row = await client.cmsCatalogItem.findFirst({
    where: {
      kind: item.kind,
      scope: CmsCatalogScope.GLOBAL,
      organizationId: null,
      slug: item.slug,
    },
    select: { id: true },
  });
  return row === null ? null : row.id;
}

function isJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Narrows the typed starter definitions to Prisma's JSON input without an
 * unchecked assertion. Every value the seed declares is a JSON primitive, an
 * array or a plain object; anything else fails loudly before it reaches the
 * database.
 */
export function toCatalogJsonValue(value: unknown): Prisma.InputJsonValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (isJsonArray(value)) {
    return value.map((entry) => toCatalogJsonValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    const entries: (readonly [string, Prisma.InputJsonValue])[] = [];
    for (const key of Object.keys(value)) {
      const entry: unknown = Reflect.get(value, key);
      if (entry !== undefined) {
        entries.push([key, toCatalogJsonValue(entry)]);
      }
    }
    return Object.fromEntries(entries);
  }
  throw new Error("The starter catalog definition contains a value that cannot be stored as JSON.");
}

function buildItemRow(
  item: StarterCatalogItem,
  publishedAt: Date,
): Prisma.CmsCatalogItemUncheckedCreateInput {
  return {
    id: item.id,
    kind: item.kind,
    scope: CmsCatalogScope.GLOBAL,
    organizationId: null,
    name: item.name,
    slug: item.slug,
    category: item.category,
    industries: [...item.industries],
    definition: toCatalogJsonValue(item.definition),
    previewRef: null,
    flagKey: null,
    targeting: {},
    status: CmsCatalogStatus.ACTIVE,
    contractVersion: STARTER_CATALOG_CONTRACT_VERSION,
    currentVersion: STARTER_CATALOG_VERSION_NUMBER,
    draftVersion: null,
    concurrencyVersion: 1,
    previewedAt: null,
    previewedHash: null,
    previewedBy: null,
    publishedAt,
    createdBy: STARTER_CATALOG_ACTOR,
    updatedBy: STARTER_CATALOG_ACTOR,
  };
}

function buildVersionRow(
  item: StarterCatalogItem,
  publishedAt: Date,
): Prisma.CmsCatalogItemVersionUncheckedCreateInput {
  return {
    id: starterCatalogVersionId(item.slug),
    itemId: item.id,
    version: STARTER_CATALOG_VERSION_NUMBER,
    definition: toCatalogJsonValue(item.definition),
    status: CmsCatalogStatus.ACTIVE,
    contractVersion: STARTER_CATALOG_CONTRACT_VERSION,
    changeNote: "Initial starter catalog",
    previewedAt: null,
    previewedHash: null,
    previewedBy: null,
    publishedAt,
    publishedBy: STARTER_CATALOG_ACTOR,
    createdBy: STARTER_CATALOG_ACTOR,
  };
}

async function insertItem(
  client: StarterCatalogSeedClient,
  item: StarterCatalogItem,
  publishedAt: Date,
): Promise<void> {
  await client.cmsCatalogItem.create({ data: buildItemRow(item, publishedAt) });
  await client.cmsCatalogItemVersion.create({ data: buildVersionRow(item, publishedAt) });
}

interface MissingItemOutcome {
  readonly inserted: boolean;
  readonly slugTaken: boolean;
}

async function insertMissingItem(
  client: StarterCatalogSeedClient,
  item: StarterCatalogItem,
  publishedAt: Date,
): Promise<MissingItemOutcome> {
  if ((await findItemId(client, item.id)) !== null) {
    return { inserted: false, slugTaken: false };
  }
  if ((await findGlobalSlugOwner(client, item)) !== null) {
    return { inserted: false, slugTaken: true };
  }
  await insertItem(client, item, publishedAt);
  return { inserted: true, slugTaken: false };
}

interface Tally {
  itemsInserted: number;
  itemsSkipped: number;
  readonly slugsSkipped: string[];
}

interface PendingItem {
  readonly slug: string;
  readonly outcome: MissingItemOutcome;
}

function tallyItems(pending: readonly PendingItem[]): StarterCatalogSeedResult {
  const tally: Tally = { itemsInserted: 0, itemsSkipped: 0, slugsSkipped: [] };
  for (const { slug, outcome } of pending) {
    if (outcome.inserted) {
      tally.itemsInserted += 1;
      continue;
    }
    tally.itemsSkipped += 1;
    if (outcome.slugTaken) {
      tally.slugsSkipped.push(slug);
    }
  }
  return {
    itemsInserted: tally.itemsInserted,
    itemsSkipped: tally.itemsSkipped,
    versionsInserted: tally.itemsInserted,
    slugsSkipped: tally.slugsSkipped,
  };
}

async function insertMissingItems(
  client: StarterCatalogSeedClient,
  seed: StarterCatalogSeed,
  publishedAt: Date,
): Promise<StarterCatalogSeedResult> {
  const pending = await Promise.all(
    seed.items.map(async (item): Promise<PendingItem> => ({
      slug: item.slug,
      outcome: await insertMissingItem(client, item, publishedAt),
    })),
  );
  return tallyItems(pending);
}

/** Options for the seed transaction, mirroring Prisma's interactive transaction bounds. */
export interface StarterCatalogTransactionOptions {
  readonly timeout: number;
  readonly maxWait: number;
}

/** The transaction runner the seed needs; PrismaClient satisfies it. */
export interface StarterCatalogTransactionRunner {
  $transaction<T>(
    fn: (tx: StarterCatalogSeedClient) => Promise<T>,
    options: StarterCatalogTransactionOptions,
  ): Promise<T>;
}

/** The CLI client adds the disconnect the process bootstrap owns. */
export interface StarterCatalogCliClient extends StarterCatalogTransactionRunner {
  $disconnect(): Promise<void>;
}

/** Process hooks kept injectable so the bootstrap can be tested without exiting. */
export interface StarterCatalogCliHooks {
  readonly writeLine: (line: string) => void;
  readonly writeWarning: (line: string) => void;
  readonly writeError: (error: unknown) => void;
  readonly markFailed: () => void;
}

/**
 * Inserts the starter catalog items and their first published version.
 *
 * Call this inside a transaction (the CLI and the test both do) so an item and
 * its version commit together. Re-running is a no-op for rows that exist.
 */
export async function seedStarterCatalog(
  client: StarterCatalogSeedClient,
): Promise<StarterCatalogSeedResult> {
  return insertMissingItems(client, buildStarterCatalogSeed(), new Date());
}

function formatSeedLine(result: StarterCatalogSeedResult): string {
  return (
    "Starter catalog seeded: " +
    String(result.itemsInserted) +
    " items and " +
    String(result.versionsInserted) +
    " published versions inserted, " +
    String(result.itemsSkipped) +
    " already present.\n"
  );
}

function formatSlugWarning(slug: string): string {
  return (
    'Skipped the starter item "' +
    slug +
    '": a catalog item with that kind and slug already exists.'
  );
}

/**
 * Runs the seed in one transaction and reports the outcome through the
 * injected hooks. The CLI bootstrap supplies the process streams.
 */
export async function runStarterCatalogSeed(
  client: StarterCatalogTransactionRunner,
  writeLine: (line: string) => void,
  writeWarning: (line: string) => void,
): Promise<StarterCatalogSeedResult> {
  const result = await client.$transaction((tx) => seedStarterCatalog(tx), {
    timeout: 60_000,
    maxWait: 10_000,
  });
  writeLine(formatSeedLine(result));
  for (const slug of result.slugsSkipped) {
    writeWarning(formatSlugWarning(slug));
  }
  return result;
}

/**
 * Process-facing wrapper: reports a failure and sets the exit code, and always
 * disconnects the database client.
 */
export async function runStarterCatalogSeedCli(
  client: StarterCatalogCliClient,
  hooks: StarterCatalogCliHooks,
): Promise<void> {
  try {
    await runStarterCatalogSeed(client, hooks.writeLine, hooks.writeWarning);
  } catch (error: unknown) {
    hooks.writeError(error);
    hooks.markFailed();
  } finally {
    await client.$disconnect();
  }
}

const PROCESS_HOOKS: StarterCatalogCliHooks = {
  writeLine: (line) => process.stdout.write(line),
  writeWarning: (line) => console.warn(line),
  writeError: (error) => console.error("Starter catalog seed failed:", error),
  markFailed: () => (process.exitCode = 1),
};

const entrypoint = process.argv[1];
// prettier-ignore
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) void runStarterCatalogSeedCli(prisma, PROCESS_HOOKS);
