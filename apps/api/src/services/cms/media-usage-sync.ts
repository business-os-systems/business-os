import { createHash } from "node:crypto";
import { MediaUsageStatus, Prisma } from "@suite/db";
import { logger } from "@suite/logger";
import {
  registerUsageIfAssetExists,
  removeUsageInTransaction,
} from "@suite/media";
import {
  collectMediaReferences,
  type MediaReferenceLocation,
  type PageAst,
} from "@suite/website-builder/ast";

const WEBSITE_BUILDER_APP_ID = "website-builder";
const PAGE_MEDIA_RESOURCE_TYPE = "Page";

const MAX_USAGE_SUB_KEY_LENGTH = 64;

type PageMediaUsageStatus =
  (typeof MediaUsageStatus)[keyof typeof MediaUsageStatus];

export interface SyncPageMediaUsageInput {
  readonly tx: Prisma.TransactionClient;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly pageId: string;
  readonly ast: PageAst;
  readonly status: PageMediaUsageStatus;
}

interface UsageIdentity {
  readonly assetId: string;
  readonly subKey: string;
}

/**
 * MediaUsage.subKey is a bounded column. Block ids are usually shorter, and a
 * long id is folded deterministically so the same block always maps to the same
 * usage row instead of creating a second one.
 */
function usageSubKey(blockId: string): string {
  if (blockId.length <= MAX_USAGE_SUB_KEY_LENGTH) {
    return blockId;
  }
  const digest = createHash("sha256").update(blockId).digest("hex");
  return "blk_" + digest.slice(0, MAX_USAGE_SUB_KEY_LENGTH - 4);
}

/**
 * Holds a shared lock on every referenced asset until the caller's transaction
 * ends. Asset deletion takes an exclusive lock on the same row before it reads
 * usages, so a reference can never be registered for an asset a concurrent
 * delete is removing, and a reference registered here is visible to that
 * delete's guard. Ids are locked in sorted order so the lock set is stable.
 */
async function lockReferencedAssets(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assetIds: readonly string[]
): Promise<void> {
  const ordered = [...new Set(assetIds)].sort();
  if (ordered.length === 0) {
    return;
  }
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "media_assets"
     WHERE "organizationId" = ${organizationId}
       AND "id" IN (${Prisma.join(ordered)})
     FOR SHARE
  `);
}

function identityKey(identity: UsageIdentity): string {
  return identity.assetId + "\u0000" + identity.subKey;
}

function toIdentity(reference: MediaReferenceLocation): UsageIdentity {
  return { assetId: reference.assetId, subKey: usageSubKey(reference.blockId) };
}

function desiredIdentities(ast: PageAst): Map<string, UsageIdentity> {
  const desired = new Map<string, UsageIdentity>();
  for (const reference of collectMediaReferences(ast)) {
    const identity = toIdentity(reference);
    desired.set(identityKey(identity), identity);
  }
  return desired;
}

interface ExistingUsage {
  readonly id: string;
  readonly assetId: string;
  readonly subKey: string;
  readonly status: MediaUsageStatus;
}

async function loadPageUsages(
  input: Pick<SyncPageMediaUsageInput, "tx" | "organizationId" | "pageId">
): Promise<ExistingUsage[]> {
  return input.tx.mediaUsage.findMany({
    where: {
      organizationId: input.organizationId,
      appId: WEBSITE_BUILDER_APP_ID,
      resourceType: PAGE_MEDIA_RESOURCE_TYPE,
      resourceId: input.pageId,
    },
    select: { id: true, assetId: true, subKey: true, status: true },
  });
}

function shouldSkip(
  input: SyncPageMediaUsageInput,
  existing: ExistingUsage | undefined
): boolean {
  if (existing === undefined) {
    return false;
  }
  if (
    input.status === MediaUsageStatus.DRAFT &&
    existing.status === MediaUsageStatus.PUBLISHED
  ) {
    return true;
  }
  return existing.status === input.status;
}

async function registerReference(
  input: SyncPageMediaUsageInput,
  identity: UsageIdentity,
  existing: ExistingUsage | undefined
): Promise<void> {
  if (shouldSkip(input, existing)) {
    return;
  }
  const usage = await registerUsageIfAssetExists(
    input.tx,
    { organizationId: input.organizationId, userId: input.actorUserId },
    identity.assetId,
    {
      appId: WEBSITE_BUILDER_APP_ID,
      resourceType: PAGE_MEDIA_RESOURCE_TYPE,
      resourceId: input.pageId,
      subKey: identity.subKey,
      status: input.status,
    }
  );
  if (usage === null) {
    logger.warn(
      { pageId: input.pageId, assetId: identity.assetId, status: input.status },
      "A page references a media asset that is no longer in this workspace; the usage was not registered."
    );
  }
}

function isStale(
  input: SyncPageMediaUsageInput,
  existing: ExistingUsage,
  desired: ReadonlyMap<string, UsageIdentity>
): boolean {
  if (desired.has(identityKey({ assetId: existing.assetId, subKey: existing.subKey }))) {
    return false;
  }
  if (input.status === MediaUsageStatus.PUBLISHED) {
    return true;
  }
  return existing.status === MediaUsageStatus.DRAFT;
}

async function removeStaleUsages(
  input: SyncPageMediaUsageInput,
  existing: readonly ExistingUsage[],
  desired: ReadonlyMap<string, UsageIdentity>
): Promise<void> {
  const actor = {
    organizationId: input.organizationId,
    userId: input.actorUserId,
  };
  const stale = existing.filter((usage) => isStale(input, usage, desired));
  await Promise.all(
    stale.map((usage) =>
      removeUsageInTransaction(input.tx, actor, usage.assetId, usage.id)
    )
  );
}

/**
 * Releases every usage owned by a page that is being deleted. Deleting the page
 * already removes the referencing content, so the asset must stop being held.
 */
export async function removePageMediaUsages(input: {
  readonly tx: Prisma.TransactionClient;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly pageId: string;
}): Promise<void> {
  const usages = await loadPageUsages({
    tx: input.tx,
    organizationId: input.organizationId,
    pageId: input.pageId,
  });
  const actor = {
    organizationId: input.organizationId,
    userId: input.actorUserId,
  };
  await Promise.all(
    usages.map((usage) =>
      removeUsageInTransaction(input.tx, actor, usage.assetId, usage.id)
    )
  );
}

/**
 * Reconciles the page's usage rows with its AST in the caller's transaction:
 * draft saves state DRAFT rows (never downgrading a PUBLISHED row), and publish
 * promotes rows to PUBLISHED and releases references the page dropped. The
 * composite unique key makes every replay idempotent (FR-120, FR-121).
 */
export async function syncPageMediaUsages(
  input: SyncPageMediaUsageInput
): Promise<void> {
  const desired = desiredIdentities(input.ast);
  await lockReferencedAssets(
    input.tx,
    input.organizationId,
    [...desired.values()].map((identity) => identity.assetId)
  );
  const existing = await loadPageUsages(input);
  const byIdentity = new Map(
    existing.map((usage) => [
      identityKey({ assetId: usage.assetId, subKey: usage.subKey }),
      usage,
    ])
  );
  await Promise.all(
    [...desired.values()].map((identity) =>
      registerReference(input, identity, byIdentity.get(identityKey(identity)))
    )
  );
  await removeStaleUsages(input, existing, desired);
}
