import { pathToFileURL } from "node:url";
import { logger } from "@suite/logger";
import { prisma, type PrismaClient } from "@suite/db";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { SITE_DELETION_FLAG_AFTER_DAYS } from "../services/admin/site-deletion.contract.js";

/**
 * Inactive-site lifecycle job (FR-097). It only marks a site for deletion;
 * content is never removed by a timer. A human operator must confirm removal
 * through the audited admin route.
 */
export const SITE_DELETION_FLAG_ACTOR = "system:site-deletion-lifecycle";
export const SITE_DELETION_FLAG_BATCH_SIZE = 100;
export const SITE_DELETION_FLAG_CONCURRENCY = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const FLAGGABLE_SITE_STATUSES = ["DRAFT", "PUBLISHED", "MAINTENANCE"] as const;

export interface SiteDeletionFlagResult {
  readonly flagged: number;
  readonly candidates: number;
}

interface SiteDeletionFlagOptions {
  readonly client?: PrismaClient;
  readonly now?: Date;
  readonly olderThanDays?: number;
  readonly batchSize?: number;
  /** Bounds a targeted run; the scheduled sweep covers every tenant. */
  readonly organizationIds?: readonly string[];
}

interface FlagOneSiteInput {
  readonly client: PrismaClient;
  readonly site: {
    readonly id: string;
    readonly organizationId: string;
    readonly updatedAt: Date;
  };
  readonly now: Date;
  readonly thresholdDays: number;
}

/** Flags one candidate; false when another run already claimed it. */
export async function flagSiteForDeletion(input: FlagOneSiteInput): Promise<boolean> {
  return input.client.$transaction(async (tx) => {
    const updated = await tx.cmsSite.updateMany({
      where: {
        id: input.site.id,
        organizationId: input.site.organizationId,
        deletionFlaggedAt: null,
        deletionConfirmedAt: null,
      },
      data: { deletionFlaggedAt: input.now },
    });
    if (updated.count === 0) {
      return false;
    }
    await writeCmsAudit(tx, {
      organizationId: input.site.organizationId,
      siteId: input.site.id,
      action: CMS_AUDIT_ACTIONS.SITE_DELETION_FLAGGED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      entityId: input.site.id,
      actorUserId: SITE_DELETION_FLAG_ACTOR,
      changes: {
        flaggedAt: input.now.toISOString(),
        inactiveSince: input.site.updatedAt.toISOString(),
        thresholdDays: input.thresholdDays,
      },
    });
    return true;
  });
}

interface FlagChunkInput {
  readonly client: PrismaClient;
  readonly now: Date;
  readonly thresholdDays: number;
}

/** Bounds concurrent transactions so the shared pool is never exhausted. */
async function flagChunk<TSite extends { id: string; organizationId: string; updatedAt: Date }>(
  sites: readonly TSite[],
  input: FlagChunkInput,
  start: number,
  flagged: number,
): Promise<number> {
  if (start >= sites.length) {
    return flagged;
  }
  const chunk = sites.slice(start, start + SITE_DELETION_FLAG_CONCURRENCY);
  const outcomes = await Promise.all(
    chunk.map((site) =>
      flagSiteForDeletion({
        client: input.client,
        site,
        now: input.now,
        thresholdDays: input.thresholdDays,
      }),
    ),
  );
  return flagChunk(
    sites,
    input,
    start + SITE_DELETION_FLAG_CONCURRENCY,
    flagged + outcomes.filter((didFlag) => didFlag).length,
  );
}

export async function flagInactiveSites(
  options: SiteDeletionFlagOptions = {},
): Promise<SiteDeletionFlagResult> {
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const thresholdDays = options.olderThanDays ?? SITE_DELETION_FLAG_AFTER_DAYS;
  const cutoff = new Date(now.getTime() - thresholdDays * DAY_MS);
  const sites = await client.cmsSite.findMany({
    where: {
      deletionFlaggedAt: null,
      deletionConfirmedAt: null,
      status: { in: [...FLAGGABLE_SITE_STATUSES] },
      updatedAt: { lt: cutoff },
      ...(options.organizationIds === undefined
        ? {}
        : { organizationId: { in: [...options.organizationIds] } }),
    },
    orderBy: { updatedAt: "asc" },
    take: options.batchSize ?? SITE_DELETION_FLAG_BATCH_SIZE,
    select: { id: true, organizationId: true, updatedAt: true },
  });
  const flagged = await flagChunk(sites, { client, now, thresholdDays }, 0, 0);
  return { flagged, candidates: sites.length };
}

/** Job entrypoint; options keep the dry-run and test paths scoped. */
export async function main(options: SiteDeletionFlagOptions = {}): Promise<void> {
  const result = await flagInactiveSites(options);
  logger.info(result, "Inactive-site deletion flagging complete");
}

/* c8 ignore start -- CLI bootstrap runs only when the file is executed directly */
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(
      "Site deletion flagging failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
