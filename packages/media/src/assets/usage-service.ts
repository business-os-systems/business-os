import {
  MediaUsageStatus,
  Prisma,
  type MediaUsage,
} from "@suite/db";
import { MEDIA_AUDIT_ACTIONS, MEDIA_AUDIT_ENTITY_TYPES } from "../constants.js";
import type { MediaUsageView, RegisterUsageBody } from "../contracts.js";
import { createMediaError, MediaInUseError } from "../errors.js";
import { appendMediaAuditEvent } from "../audit.js";
import { assertKnownAppId } from "../validation.js";
import type { MediaActor } from "../contracts.js";

export type MediaUsageClient = Prisma.TransactionClient;

type UsageIdentity = Pick<
  MediaUsage,
  "appId" | "resourceType" | "resourceId" | "subKey"
>;

export type DeletableUsage = Pick<MediaUsage, "status"> & UsageIdentity;

export function toUsageView(usage: MediaUsage): MediaUsageView {
  return {
    id: usage.id,
    assetId: usage.assetId,
    appId: usage.appId,
    resourceType: usage.resourceType,
    resourceId: usage.resourceId,
    subKey: usage.subKey,
    status: usage.status,
    createdAt: usage.createdAt.toISOString(),
  };
}

/**
 * FR-121: a PUBLISHED usage blocks deletion and every referencing location is
 * reported. DRAFT usages do not keep a live site intact, so they are removed
 * with the asset in the same transaction.
 */
export function assertAssetDeletable(
  usages: readonly DeletableUsage[]
): void {
  const published = usages.filter(
    (usage) => usage.status === MediaUsageStatus.PUBLISHED
  );
  if (published.length === 0) {
    return;
  }
  throw new MediaInUseError(
    published.map((usage) => ({
      appId: usage.appId,
      resourceType: usage.resourceType,
      resourceId: usage.resourceId,
      subKey: usage.subKey,
    }))
  );
}

async function requireAsset(
  tx: MediaUsageClient,
  actor: MediaActor,
  assetId: string
): Promise<void> {
  const asset = await tx.mediaAsset.findFirst({
    where: { id: assetId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (asset === null) {
    throw createMediaError(
      "MEDIA_ASSET_NOT_FOUND",
      `Media asset ${assetId} was not found in this workspace.`
    );
  }
}

function usageIdentity(input: RegisterUsageBody): UsageIdentity {
  return {
    appId: input.appId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    subKey: input.subKey,
  };
}

function usageSnapshot(usage: MediaUsage): Prisma.InputJsonObject {
  return {
    appId: usage.appId,
    resourceType: usage.resourceType,
    resourceId: usage.resourceId,
    subKey: usage.subKey,
    status: usage.status,
  };
}

/**
 * Registers (or re-states) a usage from an application resource. The composite
 * unique key makes replay idempotent: registering the same reference twice
 * updates one row instead of creating a second one.
 */
export async function registerUsageInTransaction(
  tx: MediaUsageClient,
  actor: MediaActor,
  assetId: string,
  input: RegisterUsageBody
): Promise<MediaUsage> {
  await requireAsset(tx, actor, assetId);
  assertKnownAppId(input.appId);
  const identity = usageIdentity(input);
  const where = { assetId_appId_resourceType_resourceId_subKey: { assetId, ...identity } };
  const existing = await tx.mediaUsage.findUnique({ where });
  const usage = await tx.mediaUsage.upsert({
    where,
    create: {
      organizationId: actor.organizationId,
      assetId,
      ...identity,
      status: input.status,
    },
    update: { status: input.status },
  });
  await appendMediaAuditEvent(tx, {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: MEDIA_AUDIT_ACTIONS.USAGE_REGISTERED,
    entityType: MEDIA_AUDIT_ENTITY_TYPES.USAGE,
    entityId: usage.id,
    before: existing === null ? null : usageSnapshot(existing),
    after: usageSnapshot(usage),
  });
  return usage;
}

/**
 * Registers a reference only when the asset still exists in the same tenant.
 * Draft content may legitimately reference an asset a DRAFT usage allowed to be
 * deleted; such a stale reference is skipped instead of failing the whole save.
 */
export async function registerUsageIfAssetExists(
  tx: MediaUsageClient,
  actor: MediaActor,
  assetId: string,
  input: RegisterUsageBody
): Promise<MediaUsage | null> {
  const asset = await tx.mediaAsset.findFirst({
    where: { id: assetId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (asset === null) {
    return null;
  }
  return registerUsageInTransaction(tx, actor, assetId, input);
}

export async function removeUsageInTransaction(
  tx: MediaUsageClient,
  actor: MediaActor,
  assetId: string,
  usageId: string
): Promise<MediaUsage> {
  const usage = await tx.mediaUsage.findFirst({
    where: {
      id: usageId,
      assetId,
      organizationId: actor.organizationId,
    },
  });
  if (usage === null) {
    throw createMediaError(
      "MEDIA_ASSET_NOT_FOUND",
      `Media usage ${usageId} was not found on this asset.`
    );
  }
  await tx.mediaUsage.delete({ where: { id: usageId } });
  await appendMediaAuditEvent(tx, {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: MEDIA_AUDIT_ACTIONS.USAGE_REMOVED,
    entityType: MEDIA_AUDIT_ENTITY_TYPES.USAGE,
    entityId: usage.id,
    before: usageSnapshot(usage),
    after: null,
  });
  return usage;
}
