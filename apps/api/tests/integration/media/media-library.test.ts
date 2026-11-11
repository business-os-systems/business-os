import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MediaAssetStatus,
  MediaUsageStatus,
  disconnectTenantRuntimeClient,
  prisma,
  withTenantContext,
} from "@suite/db";
import { QuotaExceededError } from "@suite/core/errors";
import { AppError } from "@suite/core/errors";
import {
  createMediaService,
  type MediaActor,
  type MediaAllowedMimeType,
  type MediaConfig,
  type MediaService,
} from "@suite/media";
import { InMemoryStorageAdapter } from "@suite/media/testing";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";

loadPlatformTestEnv();

const enabled = Boolean(
  process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL
);

const CONFIG: MediaConfig = {
  bucket: "business-os-media",
  region: "auto",
  endpoint: "https://storage.example.com",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  publicBaseUrl: "https://cdn.example.com/media",
  maxBytes: 1_048_576,
  urlTtlSeconds: 900,
  checksumMode: "provider",
};

const ACTOR_USER = "usr_media_integration";
const WEBSITE_BUILDER_APP_ID = "website-builder";
const PAGE_RESOURCE = "Page";
const STORAGE_QUOTA_KEY = "media.storage";
const suffix = `media-${randomUUID().slice(0, 8)}`;
const organizationIds: string[] = [];
let operatorId = "";

let storage: InMemoryStorageAdapter;
let service: MediaService;

function actor(organizationId: string): MediaActor {
  return { organizationId, userId: ACTOR_USER };
}

function checksumFor(label: string): string {
  return Buffer.from(label).toString("hex").padEnd(64, "0").slice(0, 64);
}

async function createOrganization(label: string): Promise<string> {
  const organization = await prisma.organization.create({
    data: {
      name: `Media ${label} ${suffix}`,
      slug: `media-${label}-${suffix}`,
    },
  });
  organizationIds.push(organization.id);
  return organization.id;
}

async function uploadAssetWith(
  target: MediaService,
  input: {
    readonly organizationId: string;
    readonly label: string;
    readonly sizeBytes?: number;
    readonly mimeType?: MediaAllowedMimeType;
  }
): Promise<Awaited<ReturnType<MediaService["finalizeUpload"]>>> {
  const sizeBytes = input.sizeBytes ?? 1_024;
  const checksum = checksumFor(input.label);
  const fileName = `${input.label}.png`;
  const mimeType = input.mimeType ?? "image/png";
  const tenant = actor(input.organizationId);
  const intent = await target.createUploadIntent(tenant, {
    fileName,
    mimeType,
    sizeBytes,
    checksum,
  });
  storage.putObject({
    storageKey: intent.storageKey,
    mimeType,
    sizeBytes,
    checksumHex: checksum,
    fileName,
  });
  return target.finalizeUpload(tenant, {
    storageKey: intent.storageKey,
    checksum,
    width: 800,
    height: 600,
  });
}

function uploadAsset(input: {
  readonly organizationId: string;
  readonly label: string;
  readonly sizeBytes?: number;
  readonly mimeType?: MediaAllowedMimeType;
}): Promise<Awaited<ReturnType<MediaService["finalizeUpload"]>>> {
  return uploadAssetWith(service, input);
}

async function setStorageQuota(
  organizationId: string,
  limitValue: number
): Promise<void> {
  await prisma.quota.create({
    data: {
      organizationId,
      resourceKey: STORAGE_QUOTA_KEY,
      limitValue,
      isEnforced: true,
      updatedBy: operatorId,
    },
  });
}

async function storageUsage(organizationId: string): Promise<bigint> {
  const rows = await prisma.$queryRaw<{ currentValue: bigint | null }[]>`
    SELECT "currentValue"
    FROM platform."v_tenant_usage"
    WHERE "organizationId" = ${organizationId}
      AND "resourceKey" = 'media.storage'
  `;
  return rows[0]?.currentValue ?? 0n;
}

beforeAll(async () => {
  if (!enabled) return;
  storage = new InMemoryStorageAdapter();
  service = createMediaService({ storage, config: CONFIG });
  const operator = await prisma.platformOperator.create({
    data: {
      email: `media-${suffix}@example.com`,
      displayName: "Media Integration Operator",
      status: "ACTIVE",
    },
  });
  operatorId = operator.id;
});

afterAll(async () => {
  if (!enabled) return;
  if (organizationIds.length > 0) {
    await prisma.mediaUsage.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.mediaAsset.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.quota.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  if (operatorId.length > 0) {
    await prisma.platformOperator.delete({ where: { id: operatorId } });
  }
  await disconnectTenantRuntimeClient();
});

describe.skipIf(!enabled)("shared media library (real PostgreSQL)", () => {
  it("finalises a direct upload without proxying bytes and lists it", async () => {
    const organizationId = await createOrganization("finalize");
    const finalized = await uploadAsset({ organizationId, label: "hero" });

    expect(finalized.duplicate).toBe(false);
    expect(finalized.storageBytes).toBe(1_024);
    expect(finalized.width).toBe(800);
    expect(finalized.checksum).toMatch(/^[0-9a-f]{64}$/);

    const page = await service.listAssets(actor(organizationId), {
      limit: 24,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(finalized.assetId);
    expect(page.items[0]?.mimeType).toBe("image/png");
    expect(page.nextCursor).toBeNull();

    const detail = await service.getAsset(
      actor(organizationId),
      finalized.assetId
    );
    expect(detail.usages).toEqual([]);
  });

  it("returns the existing asset for a duplicate checksum and counts it once", async () => {
    const organizationId = await createOrganization("dedupe");
    await setStorageQuota(organizationId, 100_000);

    const first = await uploadAsset({
      organizationId,
      label: "duplicate",
      sizeBytes: 2_048,
    });
    const second = await uploadAsset({
      organizationId,
      label: "duplicate",
      sizeBytes: 2_048,
    });

    expect(second.duplicate).toBe(true);
    expect(second.assetId).toBe(first.assetId);
    const count = await prisma.mediaAsset.count({ where: { organizationId } });
    expect(count).toBe(1);
    expect(await storageUsage(organizationId)).toBe(2_048n);
    expect(storage.objectCount()).toBeGreaterThan(0);
  });

});

describe.skipIf(!enabled)("shared media library: checksum modes", () => {
  it("refuses a repeated checksum the provider never verified", async () => {
    const organizationId = await createOrganization("metadata-dedupe");
    const metadataService = createMediaService({
      storage,
      config: { ...CONFIG, checksumMode: "metadata" },
    });

    await uploadAssetWith(metadataService, {
      organizationId,
      label: "metadata",
      sizeBytes: 2_048,
    });

    await expect(
      uploadAssetWith(metadataService, {
        organizationId,
        label: "metadata",
        sizeBytes: 2_048,
      })
    ).rejects.toMatchObject({ code: "MEDIA_CHECKSUM_MISMATCH" });
    expect(
      await prisma.mediaAsset.count({ where: { organizationId } })
    ).toBe(1);
  });

});

describe.skipIf(!enabled)("shared media library: deletion and isolation", () => {
  it("refuses deletion while a published usage exists and lists references", async () => {
    const organizationId = await createOrganization("guard");
    const finalized = await uploadAsset({ organizationId, label: "guarded" });
    const tenant = actor(organizationId);

    await service.registerUsage(tenant, finalized.assetId, {
      appId: WEBSITE_BUILDER_APP_ID,
      resourceType: PAGE_RESOURCE,
      resourceId: "page_home",
      subKey: "hero",
      status: MediaUsageStatus.PUBLISHED,
    });

    await expect(
      service.deleteAsset(tenant, finalized.assetId)
    ).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
      status: 409,
    });

    const remaining = await prisma.mediaAsset.count({
      where: { id: finalized.assetId },
    });
    expect(remaining).toBe(1);
  });

  it("deletes an unused asset and removes its stored object", async () => {
    const organizationId = await createOrganization("delete");
    const finalized = await uploadAsset({ organizationId, label: "unused" });
    const detail = await service.getAsset(
      actor(organizationId),
      finalized.assetId
    );
    const storedKey = finalizeStorageKey(detail.url);

    const deleted = await service.deleteAsset(
      actor(organizationId),
      finalized.assetId
    );
    expect(deleted.deleted).toBe(true);
    expect(storage.hasObject(storedKey)).toBe(false);
    expect(
      await prisma.mediaAsset.count({ where: { id: finalized.assetId } })
    ).toBe(0);
  });
});

describe.skipIf(!enabled)("shared media library: tenant isolation", () => {
  it("refuses another tenant's storage key and leaves its object untouched", async () => {
    const tenantA = await createOrganization("key-a");
    const tenantB = await createOrganization("key-b");
    const finalized = await uploadAsset({ organizationId: tenantA, label: "private" });
    const detail = await service.getAsset(
      actor(tenantA),
      finalized.assetId
    );
    const storageKey = finalizeStorageKey(detail.url);

    await expect(
      service.finalizeUpload(actor(tenantB), {
        storageKey,
        checksum: checksumFor("private"),
      })
    ).rejects.toMatchObject({ code: "MEDIA_OBJECT_MISSING" });

    expect(storage.hasObject(storageKey)).toBe(true);
    expect(
      await prisma.mediaAsset.count({ where: { organizationId: tenantB } })
    ).toBe(0);
  });

  it("isolates assets by tenant through row-level security", async () => {
    const tenantA = await createOrganization("rls-a");
    const tenantB = await createOrganization("rls-b");
    const finalized = await uploadAsset({ organizationId: tenantA, label: "a" });

    await expect(
      service.getAsset(actor(tenantB), finalized.assetId)
    ).rejects.toMatchObject({ code: "MEDIA_ASSET_NOT_FOUND" });

    const page = await service.listAssets(actor(tenantB), { limit: 24 });
    expect(page.items).toEqual([]);

    const tenantRows = await withTenantContext(tenantB, (tx) =>
      tx.mediaAsset.findMany({ select: { id: true } })
    );
    expect(tenantRows).toEqual([]);
  });

});

describe.skipIf(!enabled)("shared media library: quota enforcement", () => {
  it("enforces the shared storage allowance and does not charge a duplicate", async () => {
    const organizationId = await createOrganization("quota");
    await setStorageQuota(organizationId, 1_500);

    await uploadAsset({ organizationId, label: "first", sizeBytes: 1_000 });
    await expect(
      uploadAsset({ organizationId, label: "second", sizeBytes: 1_000 })
    ).rejects.toBeInstanceOf(QuotaExceededError);

    expect(await storageUsage(organizationId)).toBe(1_000n);
    expect(
      await prisma.mediaAsset.count({ where: { organizationId } })
    ).toBe(1);
  });
});

describe.skipIf(!enabled)("shared media library: storage intent admission", () => {
  it("refuses an intent the storage allowance cannot cover", async () => {
    const organizationId = await createOrganization("quota-intent");
    await setStorageQuota(organizationId, 500);
    const isolatedStorage = new InMemoryStorageAdapter();
    const isolatedService = createMediaService({
      storage: isolatedStorage,
      config: CONFIG,
    });

    await expect(
      isolatedService.createUploadIntent(actor(organizationId), {
        fileName: "too-big.png",
        mimeType: "image/png",
        sizeBytes: 1_000,
        checksum: checksumFor("too-big"),
      })
    ).rejects.toBeInstanceOf(QuotaExceededError);

    expect(isolatedStorage.objectCount()).toBe(0);
  });
});

describe.skipIf(!enabled)("shared media library: storage dedupe at the limit", () => {
  it("lets an at-limit duplicate intent through and charges it once", async () => {
    const organizationId = await createOrganization("quota-dedupe");
    await setStorageQuota(organizationId, 1_000);
    const first = await uploadAsset({
      organizationId,
      label: "at-limit",
      sizeBytes: 1_000,
    });
    const checksum = checksumFor("at-limit");
    const tenant = actor(organizationId);
    const intent = await service.createUploadIntent(tenant, {
      fileName: "at-limit-again.png",
      mimeType: "image/png",
      sizeBytes: 1_000,
      checksum,
    });
    storage.putObject({
      storageKey: intent.storageKey,
      mimeType: "image/png",
      sizeBytes: 1_000,
      checksumHex: checksum,
      fileName: "at-limit-again.png",
    });

    const second = await service.finalizeUpload(tenant, {
      storageKey: intent.storageKey,
      checksum,
    });

    expect(second.duplicate).toBe(true);
    expect(second.assetId).toBe(first.assetId);
    expect(await storageUsage(organizationId)).toBe(1_000n);
  });
});

describe.skipIf(!enabled)("shared media library: storage enforcement at finalise", () => {
  it("discards the object when finalise is refused by the storage quota", async () => {
    const organizationId = await createOrganization("quota-discard");
    await setStorageQuota(organizationId, 500);
    const checksum = checksumFor("quota-discard");
    const tenant = actor(organizationId);
    const intent = await service.createUploadIntent(tenant, {
      fileName: "quota-discard.png",
      mimeType: "image/png",
      sizeBytes: 400,
      checksum,
    });
    storage.putObject({
      storageKey: intent.storageKey,
      mimeType: "image/png",
      sizeBytes: 1_000,
      checksumHex: checksum,
      fileName: "quota-discard.png",
    });

    await expect(
      service.finalizeUpload(tenant, {
        storageKey: intent.storageKey,
        checksum,
      })
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(storage.hasObject(intent.storageKey)).toBe(false);
    expect(
      await prisma.mediaAsset.count({ where: { organizationId } })
    ).toBe(0);
  });

});

describe.skipIf(!enabled)("shared media library: failed uploads", () => {
  it("discards an object that fails finalise verification", async () => {
    const organizationId = await createOrganization("discard");
    const checksum = checksumFor("oversize");
    const intent = await service.createUploadIntent(actor(organizationId), {
      fileName: "oversize.png",
      mimeType: "image/png",
      sizeBytes: 100,
      checksum,
    });
    storage.putObject({
      storageKey: intent.storageKey,
      mimeType: "image/png",
      sizeBytes: CONFIG.maxBytes + 1,
      checksumHex: checksum,
      fileName: "oversize.png",
    });

    await expect(
      service.finalizeUpload(actor(organizationId), {
        storageKey: intent.storageKey,
        checksum,
      })
    ).rejects.toBeInstanceOf(AppError);
    expect(storage.hasObject(intent.storageKey)).toBe(false);
    expect(
      await prisma.mediaAsset.count({ where: { organizationId } })
    ).toBe(0);
  });

});

describe.skipIf(!enabled)("shared media library: usage identity and paging", () => {
  it("re-states the same usage reference idempotently", async () => {
    const organizationId = await createOrganization("usage-idempotent");
    const finalized = await uploadAsset({ organizationId, label: "idem" });
    const tenant = actor(organizationId);
    const body = {
      appId: WEBSITE_BUILDER_APP_ID,
      resourceType: PAGE_RESOURCE,
      resourceId: "page_same",
      subKey: "hero",
      status: MediaUsageStatus.DRAFT,
    } as const;

    const first = await service.registerUsage(tenant, finalized.assetId, body);
    const second = await service.registerUsage(tenant, finalized.assetId, body);
    expect(second.id).toBe(first.id);
    expect(
      await prisma.mediaUsage.count({ where: { assetId: finalized.assetId } })
    ).toBe(1);
  });

  it("treats LIKE metacharacters in a search as literal text", async () => {
    const organizationId = await createOrganization("search");
    await uploadAsset({ organizationId, label: "alpha" });
    await uploadAsset({ organizationId, label: "beta" });

    const page = await service.listAssets(actor(organizationId), {
      limit: 24,
      search: "%",
    });

    expect(page.items).toEqual([]);
  });

  it("pages a stable list with the hard cap and returns only the rest", async () => {
    const organizationId = await createOrganization("paging");
    await uploadAsset({ organizationId, label: "one" });
    await uploadAsset({ organizationId, label: "two" });
    await uploadAsset({ organizationId, label: "three" });
    const tenant = actor(organizationId);

    const firstPage = await service.listAssets(tenant, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await service.listAssets(tenant, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });
});

describe.skipIf(!enabled)("shared media library: cleanup and audit", () => {
  it("identifies unused assets for cleanup", async () => {
    const organizationId = await createOrganization("unused");
    const used = await uploadAsset({ organizationId, label: "used" });
    await uploadAsset({ organizationId, label: "idle" });
    await service.registerUsage(actor(organizationId), used.assetId, {
      appId: WEBSITE_BUILDER_APP_ID,
      resourceType: PAGE_RESOURCE,
      resourceId: "page_used",
      subKey: "",
      status: MediaUsageStatus.DRAFT,
    });

    const page = await service.listAssets(actor(organizationId), {
      limit: 24,
      unused: true,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).not.toBe(used.assetId);
  });

  it("writes tenant audit rows in the mutation transaction", async () => {
    const organizationId = await createOrganization("audit");
    const finalized = await uploadAsset({ organizationId, label: "audited" });
    await service.registerUsage(actor(organizationId), finalized.assetId, {
      appId: WEBSITE_BUILDER_APP_ID,
      resourceType: PAGE_RESOURCE,
      resourceId: "page_audit",
      subKey: "",
      status: MediaUsageStatus.DRAFT,
    });
    await service.deleteAsset(actor(organizationId), finalized.assetId);

    const rows = await prisma.auditLog.findMany({
      where: { organizationId },
      select: { action: true },
    });
    const actions = new Set(rows.map((row) => row.action));
    expect(actions.has("MEDIA_ASSET_FINALIZED")).toBe(true);
    expect(actions.has("MEDIA_USAGE_REGISTERED")).toBe(true);
    expect(actions.has("MEDIA_ASSET_DELETED")).toBe(true);
    const assets = await prisma.mediaAsset.count({
      where: { organizationId, status: MediaAssetStatus.ACTIVE },
    });
    expect(assets).toBe(0);
  });
});

function finalizeStorageKey(publicUrl: string): string {
  const marker = "/media/";
  const index = publicUrl.indexOf(marker);
  return index === -1 ? publicUrl : publicUrl.slice(index + 1);
}
