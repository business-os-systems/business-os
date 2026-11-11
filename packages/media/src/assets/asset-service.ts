import { randomUUID } from "node:crypto";
import {
  MediaAssetStatus,
  Prisma,
  assertQuotaAvailable,
  assertTenantWriteQuotaAvailable,
  withTenantContext,
  type MediaAsset,
} from "@suite/db";
import { QUOTA_KEYS } from "@suite/core";
import { logger } from "@suite/logger";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_AUDIT_ACTIONS,
  MEDIA_AUDIT_ENTITY_TYPES,
} from "../constants.js";
import type { MediaConfig } from "../env.js";
import type {
  DeleteAssetView,
  FinalizeUploadBody,
  FinalizeUploadView,
  ListAssetsQuery,
  MediaActor,
  MediaAssetDetail,
  MediaAssetPage,
  MediaAssetView,
  MediaUsageView,
  RegisterUsageBody,
  RemoveUsageView,
  UploadIntentBody,
  UploadIntentView,
} from "../contracts.js";
import { createMediaError } from "../errors.js";
import { appendMediaAuditEvent } from "../audit.js";
import { decodeIdCursor, pageSlice } from "../pagination.js";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  assertValidStorageKey,
  buildStorageKey,
  escapeSearchTerm,
  validateUploadIntent,
  verifyUploadedObject,
  type VerifiedUpload,
} from "../validation.js";
import {
  assertAssetDeletable,
  registerUsageInTransaction,
  removeUsageInTransaction,
  toUsageView,
} from "./usage-service.js";

export interface MediaServiceDependencies {
  readonly storage: StorageAdapter;
  readonly config: MediaConfig;
  /** Test seams only; production omits them. */
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

export interface MediaService {
  createUploadIntent(
    actor: MediaActor,
    input: UploadIntentBody
  ): Promise<UploadIntentView>;
  finalizeUpload(
    actor: MediaActor,
    input: FinalizeUploadBody
  ): Promise<FinalizeUploadView>;
  listAssets(
    actor: MediaActor,
    query: ListAssetsQuery
  ): Promise<MediaAssetPage>;
  getAsset(actor: MediaActor, assetId: string): Promise<MediaAssetDetail>;
  deleteAsset(actor: MediaActor, assetId: string): Promise<DeleteAssetView>;
  registerUsage(
    actor: MediaActor,
    assetId: string,
    input: RegisterUsageBody
  ): Promise<MediaUsageView>;
  removeUsage(
    actor: MediaActor,
    assetId: string,
    usageId: string
  ): Promise<RemoveUsageView>;
}

interface FinalizeOutcome {
  readonly asset: MediaAsset;
  readonly duplicate: boolean;
  readonly discardUploadedObject: boolean;
}

function snapshot(asset: MediaAsset): Prisma.InputJsonObject {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    checksum: asset.checksum,
    status: asset.status,
  };
}

function toAssetView(asset: MediaAsset, usageCount: number): MediaAssetView {
  return {
    id: asset.id,
    kind: asset.kind,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    checksum: asset.checksum,
    width: asset.width,
    height: asset.height,
    url: asset.publicUrl,
    status: asset.status,
    usageCount,
    createdAt: asset.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return Reflect.get(error, "code") === "P2002";
}

async function removeObjectLogged(
  storage: StorageAdapter,
  storageKey: string,
  reason: string
): Promise<void> {
  try {
    await storage.removeObject(storageKey);
  } catch (error) {
    logger.error(
      { error, storageKey, reason },
      "Media object cleanup failed; the orphan requires storage reconciliation."
    );
  }
}

function buildAssetCreateInput(input: {
  readonly actor: MediaActor;
  readonly verified: VerifiedUpload;
  readonly storageKey: string;
  readonly storage: StorageAdapter;
}): Prisma.MediaAssetUncheckedCreateInput {
  return {
    organizationId: input.actor.organizationId,
    kind: "IMAGE",
    fileName: input.verified.fileName,
    mimeType: input.verified.mimeType,
    sizeBytes: input.verified.sizeBytes,
    checksum: input.verified.checksum,
    width: input.verified.width,
    height: input.verified.height,
    storageKey: input.storageKey,
    publicUrl: input.storage.publicUrlFor(input.storageKey),
    status: MediaAssetStatus.ACTIVE,
    createdBy: input.actor.userId,
  };
}

async function findDuplicateAsset(
  tx: Prisma.TransactionClient,
  actor: MediaActor,
  input: { readonly storageKey: string; readonly checksum: string }
): Promise<{ asset: MediaAsset; discardUploadedObject: boolean } | null> {
  const byStorageKey = await tx.mediaAsset.findFirst({
    where: {
      organizationId: actor.organizationId,
      storageKey: input.storageKey,
    },
  });
  if (byStorageKey !== null) {
    return { asset: byStorageKey, discardUploadedObject: false };
  }
  const byChecksum = await tx.mediaAsset.findFirst({
    where: {
      organizationId: actor.organizationId,
      checksum: input.checksum,
    },
  });
  if (byChecksum === null) {
    return null;
  }
  return { asset: byChecksum, discardUploadedObject: true };
}

async function createFinalizedAsset(
  tx: Prisma.TransactionClient,
  actor: MediaActor,
  input: {
    readonly verified: VerifiedUpload;
    readonly storageKey: string;
    readonly storage: StorageAdapter;
  }
): Promise<MediaAsset> {
  await assertTenantWriteQuotaAvailable(tx, {
    organizationId: actor.organizationId,
    resourceKey: QUOTA_KEYS.STORAGE,
    delta: input.verified.sizeBytes,
  });
  const asset = await tx.mediaAsset.create({
    data: buildAssetCreateInput({ ...input, actor }),
  });
  await appendMediaAuditEvent(tx, {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: MEDIA_AUDIT_ACTIONS.ASSET_FINALIZED,
    entityType: MEDIA_AUDIT_ENTITY_TYPES.ASSET,
    entityId: asset.id,
    before: null,
    after: snapshot(asset),
  });
  return asset;
}

async function finalizeInTransaction(
  tx: Prisma.TransactionClient,
  actor: MediaActor,
  input: {
    readonly verified: VerifiedUpload;
    readonly storageKey: string;
    readonly storage: StorageAdapter;
  }
): Promise<FinalizeOutcome> {
  const duplicate = await findDuplicateAsset(tx, actor, {
    storageKey: input.storageKey,
    checksum: input.verified.checksum,
  });
  if (duplicate !== null) {
    return {
      asset: duplicate.asset,
      duplicate: true,
      discardUploadedObject: duplicate.discardUploadedObject,
    };
  }
  const asset = await createFinalizedAsset(tx, actor, input);
  return { asset, duplicate: false, discardUploadedObject: false };
}

function buildListWhere(
  actor: MediaActor,
  query: ListAssetsQuery
): Prisma.MediaAssetWhereInput {
  const cursorId = query.cursor === undefined ? null : decodeIdCursor(query.cursor);
  return {
    organizationId: actor.organizationId,
    ...(query.type === undefined ? {} : { kind: query.type }),
    ...(query.search === undefined
      ? {}
      : {
          fileName: {
            contains: escapeSearchTerm(query.search),
            mode: "insensitive",
          },
        }),
    ...(query.unused === true ? { usages: { none: {} } } : {}),
    ...(cursorId === null ? {} : { id: { lt: cursorId } }),
  };
}

function toFinalizeView(
  asset: MediaAsset,
  duplicate: boolean
): FinalizeUploadView {
  return {
    assetId: asset.id,
    url: asset.publicUrl,
    width: asset.width,
    height: asset.height,
    checksum: asset.checksum,
    storageBytes: asset.sizeBytes,
    duplicate,
  };
}

function expectedChecksumBase64(checksumHex: string): string {
  return Buffer.from(checksumHex, "hex").toString("base64");
}

interface MediaHandlerContext {
  readonly dependencies: MediaServiceDependencies;
  readonly now: () => Date;
  readonly idFactory: () => string;
}

/**
 * Refuses an intent that could never be charged and stored. A duplicate
 * checksum is exempt because finalise returns the existing asset and charges
 * nothing, so an at-limit workspace can still re-upload bytes it already owns.
 * This is the admission half of FR-122: without it a session could presign
 * unlimited objects and never finalise them.
 */
async function assertIntentWithinStorageQuota(
  actor: MediaActor,
  input: { readonly sizeBytes: number; readonly checksum: string }
): Promise<void> {
  await withTenantContext(actor.organizationId, async (tx) => {
    const duplicate = await tx.mediaAsset.findFirst({
      where: {
        organizationId: actor.organizationId,
        checksum: input.checksum,
      },
      select: { id: true },
    });
    if (duplicate !== null) {
      return;
    }
    await assertQuotaAvailable(tx, {
      organizationId: actor.organizationId,
      resourceKey: QUOTA_KEYS.STORAGE,
      delta: input.sizeBytes,
    });
  });
}

async function createUploadIntentHandler(
  context: MediaHandlerContext,
  input: { readonly actor: MediaActor; readonly body: UploadIntentBody }
): Promise<UploadIntentView> {
  const { dependencies } = context;
  const validated = validateUploadIntent(
    input.body,
    dependencies.config.maxBytes
  );
  await assertIntentWithinStorageQuota(input.actor, {
    sizeBytes: validated.sizeBytes,
    checksum: validated.checksum,
  });
  const storageKey = buildStorageKey({
    organizationId: input.actor.organizationId,
    mimeType: validated.mimeType,
    now: context.now(),
    uniqueId: context.idFactory(),
  });
  const presigned = await dependencies.storage.createUploadUrl({
    storageKey,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    checksumHex: validated.checksum,
    fileName: validated.fileName,
  });
  return {
    uploadUrl: presigned.uploadUrl,
    storageKey,
    expiresAt: presigned.expiresAt,
    maxBytes: dependencies.config.maxBytes,
    allowedTypes: [...MEDIA_ALLOWED_MIME_TYPES],
    requiredHeaders: { ...presigned.requiredHeaders },
  };
}

async function verifyStoredUpload(
  dependencies: MediaServiceDependencies,
  actor: MediaActor,
  body: FinalizeUploadBody
): Promise<VerifiedUpload> {
  assertValidStorageKey(body.storageKey, actor.organizationId);
  const head = await dependencies.storage.headObject(body.storageKey);
  if (head === null) {
    throw createMediaError(
      "MEDIA_OBJECT_MISSING",
      "No stored object exists for this upload intent.",
      [{ name: "storageKey", reason: "Upload the file before finalising." }]
    );
  }
  try {
    return verifyUploadedObject({
      head,
      declared: body,
      maxBytes: dependencies.config.maxBytes,
      expectedChecksumBase64: expectedChecksumBase64(body.checksum),
    });
  } catch (error) {
    await removeObjectLogged(
      dependencies.storage,
      body.storageKey,
      "finalize-verification-failed"
    );
    throw error;
  }
}

async function finalizeAfterRace(input: {
  readonly actor: MediaActor;
  readonly verified: VerifiedUpload;
  readonly storageKey: string;
}): Promise<FinalizeOutcome> {
  return withTenantContext(input.actor.organizationId, async (tx) => {
    const duplicate = await findDuplicateAsset(tx, input.actor, {
      storageKey: input.storageKey,
      checksum: input.verified.checksum,
    });
    if (duplicate === null) {
      throw createMediaError(
        "MEDIA_CHECKSUM_MISMATCH",
        "The asset changed while the upload was finalising; retry the finalise.",
        [{ name: "checksum", reason: "Retry the finalise request." }]
      );
    }
    return {
      asset: duplicate.asset,
      duplicate: true,
      discardUploadedObject:
        input.storageKey !== duplicate.asset.storageKey,
    };
  });
}

interface FinalizeRequest {
  readonly actor: MediaActor;
  readonly body: FinalizeUploadBody;
  readonly verified: VerifiedUpload;
}

async function finalizeOrResolveDuplicate(
  dependencies: MediaServiceDependencies,
  request: FinalizeRequest
): Promise<FinalizeOutcome> {
  try {
    return await withTenantContext(request.actor.organizationId, (tx) =>
      finalizeInTransaction(tx, request.actor, {
        verified: request.verified,
        storageKey: request.body.storageKey,
        storage: dependencies.storage,
      })
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      await removeObjectLogged(
        dependencies.storage,
        request.body.storageKey,
        "finalize-transaction-failed"
      );
      throw error;
    }
    return resolveAfterUniqueViolation(dependencies, request);
  }
}

async function resolveAfterUniqueViolation(
  dependencies: MediaServiceDependencies,
  request: FinalizeRequest
): Promise<FinalizeOutcome> {
  try {
    return await finalizeAfterRace({
      actor: request.actor,
      verified: request.verified,
      storageKey: request.body.storageKey,
    });
  } catch (raceError) {
    await removeObjectLogged(
      dependencies.storage,
      request.body.storageKey,
      "finalize-race-unresolved"
    );
    throw raceError;
  }
}

async function discardUnusedUpload(
  dependencies: MediaServiceDependencies,
  input: { readonly storageKey: string; readonly outcome: FinalizeOutcome }
): Promise<void> {
  const isUnusedObject =
    input.outcome.discardUploadedObject ||
    input.outcome.asset.storageKey !== input.storageKey;
  if (isUnusedObject) {
    await removeObjectLogged(
      dependencies.storage,
      input.storageKey,
      "checksum-duplicate"
    );
  }
}

async function finalizeUploadHandler(
  context: MediaHandlerContext,
  input: { readonly actor: MediaActor; readonly body: FinalizeUploadBody }
): Promise<FinalizeUploadView> {
  const { dependencies } = context;
  const verified = await verifyStoredUpload(
    dependencies,
    input.actor,
    input.body
  );
  const outcome = await finalizeOrResolveDuplicate(dependencies, {
    actor: input.actor,
    body: input.body,
    verified,
  });
  await discardUnusedUpload(dependencies, {
    storageKey: input.body.storageKey,
    outcome,
  });
  return toFinalizeView(outcome.asset, outcome.duplicate);
}

async function listAssetsHandler(input: {
  readonly actor: MediaActor;
  readonly query: ListAssetsQuery;
}): Promise<MediaAssetPage> {
  const rows = await withTenantContext(input.actor.organizationId, (tx) =>
    tx.mediaAsset.findMany({
      where: buildListWhere(input.actor, input.query),
      orderBy: { id: "desc" },
      take: input.query.limit + 1,
      include: { _count: { select: { usages: true } } },
    })
  );
  const page = pageSlice(rows, input.query.limit, (row) => row.id);
  return {
    items: page.items.map((row) => toAssetView(row, row._count.usages)),
    nextCursor: page.nextCursor,
  };
}

async function getAssetHandler(input: {
  readonly actor: MediaActor;
  readonly assetId: string;
}): Promise<MediaAssetDetail> {
  const asset = await withTenantContext(input.actor.organizationId, (tx) =>
    tx.mediaAsset.findFirst({
      where: {
        id: input.assetId,
        organizationId: input.actor.organizationId,
      },
      include: { usages: { orderBy: { createdAt: "asc" } } },
    })
  );
  if (asset === null) {
    throw createMediaError(
      "MEDIA_ASSET_NOT_FOUND",
      `Media asset ${input.assetId} was not found in this workspace.`
    );
  }
  return {
    ...toAssetView(asset, asset.usages.length),
    usages: asset.usages.map(toUsageView),
  };
}

async function deleteAssetHandler(
  context: MediaHandlerContext,
  input: { readonly actor: MediaActor; readonly assetId: string }
): Promise<DeleteAssetView> {
  const deletion = await withTenantContext(input.actor.organizationId, (tx) =>
    deleteAssetInTransaction(tx, input.actor, input.assetId)
  );
  await removeObjectLogged(
    context.dependencies.storage,
    deletion.storageKey,
    "asset-deleted"
  );
  return { assetId: input.assetId, deleted: true };
}

async function registerUsageHandler(input: {
    readonly actor: MediaActor;
    readonly assetId: string;
    readonly body: RegisterUsageBody;
  }
): Promise<MediaUsageView> {
  const usage = await withTenantContext(input.actor.organizationId, (tx) =>
    registerUsageInTransaction(tx, input.actor, input.assetId, input.body)
  );
  return toUsageView(usage);
}

async function removeUsageHandler(input: {
    readonly actor: MediaActor;
    readonly assetId: string;
    readonly usageId: string;
  }
): Promise<RemoveUsageView> {
  await withTenantContext(input.actor.organizationId, (tx) =>
    removeUsageInTransaction(tx, input.actor, input.assetId, input.usageId)
  );
  return { usageId: input.usageId, removed: true };
}

/**
 * The shared media capability (FR-119). Every handler scopes reads and writes
 * to the verified tenant through withTenantContext, so RLS and the quota gate
 * see the same organization the session carries.
 */
export function createMediaService(
  dependencies: MediaServiceDependencies
): MediaService {
  const context: MediaHandlerContext = {
    dependencies,
    now: dependencies.now ?? (() => new Date()),
    idFactory: dependencies.idFactory ?? randomUUID,
  };
  return {
    createUploadIntent: (actor, body) =>
      createUploadIntentHandler(context, { actor, body }),
    finalizeUpload: (actor, body) =>
      finalizeUploadHandler(context, { actor, body }),
    listAssets: (actor, query) => listAssetsHandler({ actor, query }),
    getAsset: (actor, assetId) => getAssetHandler({ actor, assetId }),
    deleteAsset: (actor, assetId) =>
      deleteAssetHandler(context, { actor, assetId }),
    registerUsage: (actor, assetId, body) =>
      registerUsageHandler({ actor, assetId, body }),
    removeUsage: (actor, assetId, usageId) =>
      removeUsageHandler({ actor, assetId, usageId }),
  };
}

interface AssetDeletionOutcome {
  readonly storageKey: string;
}

async function lockAssetForDeletion(
  tx: Prisma.TransactionClient,
  actor: MediaActor,
  assetId: string
): Promise<{ readonly id: string; readonly storageKey: string }> {
  const locked = await tx.$queryRaw<{ id: string; storageKey: string }[]>(
    Prisma.sql`
      SELECT "id", "storageKey"
      FROM "media_assets"
      WHERE "id" = ${assetId}
        AND "organizationId" = ${actor.organizationId}
      FOR UPDATE
    `
  );
  const asset = locked[0];
  if (asset === undefined) {
    throw createMediaError(
      "MEDIA_ASSET_NOT_FOUND",
      `Media asset ${assetId} was not found in this workspace.`
    );
  }
  return asset;
}

async function deleteAssetRows(
  tx: Prisma.TransactionClient,
  actor: MediaActor,
  input: {
    readonly assetId: string;
    readonly storageKey: string;
    readonly usageCount: number;
  }
): Promise<void> {
  await tx.mediaUsage.deleteMany({
    where: { assetId: input.assetId, organizationId: actor.organizationId },
  });
  await tx.mediaAsset.delete({ where: { id: input.assetId } });
  await appendMediaAuditEvent(tx, {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: MEDIA_AUDIT_ACTIONS.ASSET_DELETED,
    entityType: MEDIA_AUDIT_ENTITY_TYPES.ASSET,
    entityId: input.assetId,
    before: {
      id: input.assetId,
      storageKey: input.storageKey,
      usageCount: input.usageCount,
    },
    after: null,
  });
}

async function deleteAssetInTransaction(
  tx: Prisma.TransactionClient,
  actor: MediaActor,
  assetId: string
): Promise<AssetDeletionOutcome> {
  const asset = await lockAssetForDeletion(tx, actor, assetId);
  const usages = await tx.mediaUsage.findMany({
    where: { assetId, organizationId: actor.organizationId },
  });
  assertAssetDeletable(usages);
  await deleteAssetRows(tx, actor, {
    assetId,
    storageKey: asset.storageKey,
    usageCount: usages.length,
  });
  return { storageKey: asset.storageKey };
}
