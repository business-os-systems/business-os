import { pathToFileURL } from "node:url";
import { logger } from "@suite/logger";
import { Prisma, prisma, type PrismaClient } from "@suite/db";
import {
  CMS_PAGE_VERSION_RETENTION,
  prunePageVersions,
} from "../services/cms/version-retention.js";

/**
 * Page-version retention sweep (T097, FR-033). The newest 30 snapshots per page
 * survive; older rows are pruned by the schema owner because the tenant
 * identity holds an append-only grant on cms_page_versions.
 *
 * Publishing prunes the pages it snapshotted in the same request. This job is
 * the safety net for history that grew through conflict checkpoints, so the
 * declared retention can never drift.
 */
export const VERSION_RETENTION_PAGE_BATCH = 50;
export const VERSION_RETENTION_MAX_BATCHES = 100;

export interface VersionRetentionRunResult {
  readonly pages: number;
  readonly pruned: number;
  readonly batches: number;
}

interface DuePage {
  readonly organizationId: string;
  readonly pageId: string;
}

interface VersionRetentionOptions {
  readonly client?: PrismaClient;
  readonly pageBatchSize?: number;
  readonly maxBatches?: number;
  /** Bounds a targeted sweep; the scheduled run covers every tenant. */
  readonly organizationIds?: readonly string[];
}

async function findPagesOverLimit(
  client: PrismaClient,
  limit: number,
  organizationIds: readonly string[] | undefined,
): Promise<readonly DuePage[]> {
  if (organizationIds === undefined) {
    return client.$queryRaw<DuePage[]>`
      SELECT "organizationId", "pageId"
        FROM "cms"."cms_page_versions"
       GROUP BY "organizationId", "pageId"
      HAVING COUNT(*) > ${CMS_PAGE_VERSION_RETENTION}
       ORDER BY "pageId" ASC
       LIMIT ${limit}
    `;
  }
  return client.$queryRaw<DuePage[]>`
    SELECT "organizationId", "pageId"
      FROM "cms"."cms_page_versions"
     WHERE "organizationId" IN (${Prisma.join(organizationIds)})
     GROUP BY "organizationId", "pageId"
    HAVING COUNT(*) > ${CMS_PAGE_VERSION_RETENTION}
     ORDER BY "pageId" ASC
     LIMIT ${limit}
  `;
}

interface SweepState {
  readonly pages: number;
  readonly pruned: number;
  readonly batches: number;
}

interface SweepInput {
  readonly client: PrismaClient;
  readonly pageBatchSize: number;
  readonly maxBatches: number;
  readonly organizationIds: readonly string[] | undefined;
}

async function sweepBatch(input: SweepInput, state: SweepState): Promise<SweepState> {
  if (state.batches >= input.maxBatches) {
    return state;
  }
  const due = await findPagesOverLimit(input.client, input.pageBatchSize, input.organizationIds);
  if (due.length === 0) {
    return state;
  }
  const prunedCounts = await Promise.all(
    due.map((page) =>
      prunePageVersions({
        organizationId: page.organizationId,
        pageId: page.pageId,
        client: input.client,
      }),
    ),
  );
  const next: SweepState = {
    pages: state.pages + due.length,
    pruned: state.pruned + prunedCounts.reduce((total, count) => total + count, 0),
    batches: state.batches + 1,
  };
  if (due.length < input.pageBatchSize) {
    return next;
  }
  return sweepBatch(input, next);
}

/** Prunes every page that exceeds the declared limit, in bounded batches. */
export async function runVersionRetention(
  options: VersionRetentionOptions = {},
): Promise<VersionRetentionRunResult> {
  return sweepBatch(
    {
      client: options.client ?? prisma,
      pageBatchSize: options.pageBatchSize ?? VERSION_RETENTION_PAGE_BATCH,
      maxBatches: options.maxBatches ?? VERSION_RETENTION_MAX_BATCHES,
      organizationIds: options.organizationIds,
    },
    { pages: 0, pruned: 0, batches: 0 },
  );
}

export async function main(options: VersionRetentionOptions = {}): Promise<void> {
  const result = await runVersionRetention(options);
  logger.info(
    "Page version retention (" +
      CMS_PAGE_VERSION_RETENTION +
      " per page): pruned " +
      result.pruned +
      " row(s) across " +
      result.pages +
      " page(s) in " +
      result.batches +
      " batch(es).",
  );
}

/* c8 ignore start -- CLI bootstrap runs only when the file is executed directly */
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(
      "Page version retention failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
