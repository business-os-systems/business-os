import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { CmsCatalogKind, CmsCatalogScope, CmsCatalogStatus } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY,
  WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY,
  WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY,
  websiteBuilderCatalogRouter,
} from "../../src/routes/admin/app-catalog.js";
import {
  CATALOG_ITEM_KINDS,
  CATALOG_ITEM_SCOPES,
  CATALOG_ITEM_STATUSES,
  catalogItemSchema,
  catalogItemVersionSchema,
  type CatalogItem,
} from "../../src/services/admin/app-catalog.contract.js";
import { createCatalogPreviewReference } from "../../src/services/admin/app-catalog.service.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../src/middleware/rate-limit.js";
import { getControlSessionSecret } from "../../src/lib/platform-env.js";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();

const SECTION_DEFINITION = {
  schemaVersion: "2026-03",
  block: {
    id: "blk_hero_1",
    type: "hero",
    props: { headline: "Welcome to the restaurant" },
  },
};

const UPDATED_SECTION_DEFINITION = {
  schemaVersion: "2026-03",
  block: {
    id: "blk_hero_1",
    type: "hero",
    props: { headline: "Reserve a table tonight" },
  },
};

const itemEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: catalogItemSchema,
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

const versionPageEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        versions: z.array(catalogItemVersionSchema),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

let fixture: OperatorFixture;
let readToken: string;
let authorToken: string;
let publishToken: string;
let slugCounter = 0;

function slugPrefix(): string {
  return "catalog-342-" + fixture.suffix;
}

function uniqueSlug(label: string): string {
  slugCounter += 1;
  return slugPrefix() + "-" + label + "-" + String(slugCounter);
}

function send(input: Parameters<typeof sendOperatorRequest>[1]): Promise<Response> {
  return sendOperatorRequest(websiteBuilderCatalogRouter, input);
}

async function createDraft(overrides: Record<string, unknown> = {}): Promise<CatalogItem> {
  const response = await send({
    method: "POST",
    path: "/items",
    token: authorToken,
    body: {
      kind: "SECTION",
      name: "Restaurant hero",
      slug: uniqueSlug("section"),
      category: "hospitality",
      industries: ["hospitality"],
      definition: SECTION_DEFINITION,
      ...overrides,
    },
  });
  expect(response.status).toBe(201);
  const envelope = itemEnvelopeSchema.parse(await response.json());
  return envelope.data;
}

async function getItem(itemId: string): Promise<CatalogItem> {
  const response = await send({
    method: "GET",
    path: "/items/" + itemId,
    token: readToken,
  });
  expect(response.status).toBe(200);
  return itemEnvelopeSchema.parse(await response.json()).data;
}

async function listVersions(itemId: string) {
  const response = await send({
    method: "GET",
    path: "/items/" + itemId + "/versions",
    token: readToken,
  });
  expect(response.status).toBe(200);
  return versionPageEnvelopeSchema.parse(await response.json()).data.versions;
}

async function preview(itemId: string): Promise<void> {
  const response = await send({
    method: "POST",
    path: "/items/" + itemId + "/preview",
    token: authorToken,
  });
  expect(response.status).toBe(200);
}

function publish(
  itemId: string,
  version: number,
  options: { token?: string; idempotencyKey?: string; body?: Record<string, unknown> } = {},
): Promise<Response> {
  return send({
    method: "POST",
    path: "/items/" + itemId + "/publish",
    token: options.token ?? publishToken,
    body: { version, ...options.body },
    idempotencyKey: options.idempotencyKey,
  });
}

function lifecycle(itemId: string, action: "deprecate" | "disable" | "retire") {
  return send({
    method: "POST",
    path: "/items/" + itemId + "/" + action,
    token: publishToken,
  });
}

function auditCount(action: string, entityId: string): Promise<number> {
  return fixture.ownerPrisma.auditEvent.count({
    where: { action, entityId },
  });
}

async function cleanupCatalogRows(): Promise<void> {
  const prefix = slugPrefix();
  await fixture.ownerPrisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: prefix } } },
  });
  await fixture.ownerPrisma.cmsCatalogItem.deleteMany({
    where: { slug: { startsWith: prefix } },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  websiteBuilderCatalogRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("catalog-items");
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY);

  readToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_READ.code])).token;
  authorToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_AUTHOR.code])).token;
  publishToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_PUBLISH.code])).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY);
  await cleanupCatalogRows();
});

afterAll(async () => {
  if (!enabled) return;
  await cleanupCatalogRows();
  await fixture.cleanup();
});

it("keeps the catalog contract vocabulary aligned with the database enums", () => {
  expect([...CATALOG_ITEM_KINDS].sort()).toEqual([...Object.values(CmsCatalogKind)].sort());
  expect([...CATALOG_ITEM_SCOPES].sort()).toEqual([...Object.values(CmsCatalogScope)].sort());
  expect([...CATALOG_ITEM_STATUSES].sort()).toEqual([...Object.values(CmsCatalogStatus)].sort());
});

it.skipIf(!enabled)("creates a draft without any published history", async () => {
  const item = await createDraft();

  expect(item.status).toBe("DRAFT");
  expect(item.currentVersion).toBe(0);
  expect(item.draftVersion).toBe(1);
  expect(item.concurrencyVersion).toBe(1);
  expect(item.contractVersion).toBe("2026-03");
  expect(item.definition).toEqual(SECTION_DEFINITION);
  expect(await listVersions(item.id)).toHaveLength(0);
  expect(await auditCount(PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_CREATED, item.id)).toBe(1);
});

it.skipIf(!enabled)("requires a completed preview before publish", async () => {
  const item = await createDraft();

  const rejected = await publish(item.id, 1);
  expect(rejected.status).toBe(409);
  expect((await parseProblem(rejected)).code).toBe(PLATFORM_ERROR_CODE.PREVIEW_REQUIRED);

  await preview(item.id);
  const published = await publish(item.id, 1);
  expect(published.status).toBe(200);
  const body = itemEnvelopeSchema.parse(await published.json());
  expect(body.data.status).toBe("ACTIVE");
  expect(body.data.currentVersion).toBe(1);
  expect(body.data.draftVersion).toBeNull();
  expect(body.data.publishedAt).not.toBeNull();

  const versions = await listVersions(item.id);
  expect(versions).toHaveLength(1);
  expect(versions[0]?.version).toBe(1);
  expect(versions[0]?.definition).toEqual(SECTION_DEFINITION);
  expect(await auditCount(PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_PREVIEWED, item.id)).toBe(1);
  expect(await auditCount(PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_PUBLISHED, item.id)).toBe(1);
});

it.skipIf(!enabled)(
  "editing an active item opens a version and never rewrites history",
  async () => {
    const item = await createDraft();
    await preview(item.id);
    expect((await publish(item.id, 1)).status).toBe(200);

    const publishedItem = await getItem(item.id);
    const edited = await send({
      method: "PATCH",
      path: "/items/" + item.id,
      token: authorToken,
      body: {
        expectedVersion: publishedItem.concurrencyVersion,
        name: "Updated restaurant hero",
        definition: UPDATED_SECTION_DEFINITION,
      },
    });
    expect(edited.status).toBe(200);
    const patched = itemEnvelopeSchema.parse(await edited.json()).data;
    expect(patched.status).toBe("ACTIVE");
    expect(patched.currentVersion).toBe(1);
    expect(patched.draftVersion).toBe(2);
    expect(patched.definition).toEqual(UPDATED_SECTION_DEFINITION);

    const beforeSecondPublish = await listVersions(item.id);
    expect(beforeSecondPublish).toHaveLength(1);
    expect(beforeSecondPublish[0]?.definition).toEqual(SECTION_DEFINITION);

    await preview(item.id);
    expect((await publish(item.id, 2)).status).toBe(200);

    const versions = await listVersions(item.id);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[1]?.definition).toEqual(SECTION_DEFINITION);
    expect(versions[0]?.definition).toEqual(UPDATED_SECTION_DEFINITION);

    const immutableVersion = versions[1];
    if (immutableVersion === undefined) {
      throw new Error("Expected the first published version to exist");
    }
    await expect(
      fixture.ownerPrisma.cmsCatalogItemVersion.update({
        where: { id: immutableVersion.id },
        data: { changeNote: "tampered" },
      }),
    ).rejects.toThrow(/immutable/);
  },
);

it.skipIf(!enabled)("rejects a stale draft edit and a stale publish", async () => {
  const item = await createDraft();

  const staleEdit = await send({
    method: "PATCH",
    path: "/items/" + item.id,
    token: authorToken,
    body: { expectedVersion: 999, name: "Stale edit" },
  });
  expect(staleEdit.status).toBe(409);
  expect((await parseProblem(staleEdit)).code).toBe(PLATFORM_ERROR_CODE.VERSION_CONFLICT);

  await preview(item.id);
  const stalePublish = await publish(item.id, 99);
  expect(stalePublish.status).toBe(409);
  expect((await parseProblem(stalePublish)).code).toBe(PLATFORM_ERROR_CODE.VERSION_CONFLICT);
});

it.skipIf(!enabled)("applies an idempotent publish exactly once", async () => {
  const item = await createDraft();
  await preview(item.id);
  const key = "catalog-publish-" + fixture.suffix;

  const first = await publish(item.id, 1, { idempotencyKey: key });
  expect(first.status).toBe(200);
  const firstBody = await first.json();

  const replay = await publish(item.id, 1, { idempotencyKey: key });
  expect(replay.status).toBe(200);
  expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  expect(await replay.json()).toEqual(firstBody);
  expect(await auditCount(PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_PUBLISHED, item.id)).toBe(1);
});

it.skipIf(!enabled)("deprecates and disables, then republishes the published version", async () => {
  const item = await createDraft();
  await preview(item.id);
  expect((await publish(item.id, 1)).status).toBe(200);

  const deprecated = await lifecycle(item.id, "deprecate");
  expect(deprecated.status).toBe(200);
  expect(itemEnvelopeSchema.parse(await deprecated.json()).data.status).toBe("DEPRECATED");

  const disabled = await lifecycle(item.id, "disable");
  expect(disabled.status).toBe(200);
  expect(itemEnvelopeSchema.parse(await disabled.json()).data.status).toBe("DISABLED");

  const republished = await publish(item.id, 1);
  expect(republished.status).toBe(200);
  expect(itemEnvelopeSchema.parse(await republished.json()).data.status).toBe("ACTIVE");
});

it.skipIf(!enabled)("retires without deleting and keeps the item resolvable", async () => {
  const item = await createDraft();
  await preview(item.id);
  expect((await publish(item.id, 1)).status).toBe(200);

  const retired = await lifecycle(item.id, "retire");
  expect(retired.status).toBe(200);
  expect(itemEnvelopeSchema.parse(await retired.json()).data.status).toBe("RETIRED");

  const stillThere = await getItem(item.id);
  expect(stillThere.status).toBe("RETIRED");
  expect(await listVersions(item.id)).toHaveLength(1);

  const rejected = await publish(item.id, 1);
  expect(rejected.status).toBe(409);
  expect((await parseProblem(rejected)).code).toBe(PLATFORM_ERROR_CODE.ITEM_NOT_PUBLISHABLE);

  const repeated = await lifecycle(item.id, "retire");
  expect(repeated.status).toBe(200);
  expect(await auditCount(PLATFORM_AUDIT_ACTIONS.CATALOG_ITEM_RETIRED, item.id)).toBe(1);
});

it.skipIf(!enabled)("rejects a duplicate slug on create and on draft edit", async () => {
  const item = await createDraft({ slug: uniqueSlug("duplicate") });

  const duplicateCreate = await send({
    method: "POST",
    path: "/items",
    token: authorToken,
    body: {
      kind: "SECTION",
      name: "Second hero",
      slug: item.slug,
      category: "hospitality",
      definition: SECTION_DEFINITION,
    },
  });
  expect(duplicateCreate.status).toBe(422);
  expect((await parseProblem(duplicateCreate)).code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);

  const other = await createDraft({ slug: uniqueSlug("other") });
  const duplicateEdit = await send({
    method: "PATCH",
    path: "/items/" + other.id,
    token: authorToken,
    body: { expectedVersion: other.concurrencyVersion, slug: item.slug },
  });
  expect(duplicateEdit.status).toBe(422);
  expect((await parseProblem(duplicateEdit)).code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
});

it.skipIf(!enabled)("publishes only from an unexpired preview of the same version", async () => {
  const item = await createDraft();
  await preview(item.id);

  const previewed = await fixture.ownerPrisma.cmsCatalogItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  const current = await getItem(item.id);
  if (previewed.previewedHash === null || current.draftVersion === null) {
    throw new Error("Expected the preview evidence to be recorded");
  }

  const secret = getControlSessionSecret();
  const expired = createCatalogPreviewReference(secret, {
    itemId: item.id,
    version: current.draftVersion,
    definitionHash: previewed.previewedHash,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });
  await fixture.ownerPrisma.cmsCatalogItem.update({
    where: { id: item.id },
    data: { previewRef: expired },
  });

  const expiredPublish = await publish(item.id, current.draftVersion);
  expect(expiredPublish.status).toBe(409);
  expect((await parseProblem(expiredPublish)).code).toBe(PLATFORM_ERROR_CODE.PREVIEW_REQUIRED);

  const foreign = createCatalogPreviewReference(secret, {
    itemId: "catalog_item_somewhere_else",
    version: current.draftVersion,
    definitionHash: previewed.previewedHash,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await fixture.ownerPrisma.cmsCatalogItem.update({
    where: { id: item.id },
    data: { previewRef: foreign },
  });

  const foreignPublish = await publish(item.id, current.draftVersion);
  expect(foreignPublish.status).toBe(409);
  expect((await parseProblem(foreignPublish)).code).toBe(PLATFORM_ERROR_CODE.PREVIEW_REQUIRED);

  const future = createCatalogPreviewReference(secret, {
    itemId: item.id,
    version: current.draftVersion,
    definitionHash: previewed.previewedHash,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await fixture.ownerPrisma.cmsCatalogItem.update({
    where: { id: item.id },
    data: { previewRef: future },
  });
  expect((await publish(item.id, current.draftVersion)).status).toBe(200);
});

it.skipIf(!enabled)("stores validated targeting on the draft", async () => {
  const item = await createDraft({
    targeting: {
      plans: ["pro"],
      industries: ["hospitality"],
      orgAllowlist: ["org_allowed"],
      orgDenylist: ["org_denied"],
    },
  });

  expect(item.targeting).toEqual({
    plans: ["pro"],
    industries: ["hospitality"],
    orgAllowlist: ["org_allowed"],
    orgDenylist: ["org_denied"],
  });
});

it.skipIf(!enabled)("rejects an undeclared definition property before storage", async () => {
  const response = await send({
    method: "POST",
    path: "/items",
    token: authorToken,
    body: {
      kind: "SECTION",
      name: "Invalid hero",
      slug: uniqueSlug("invalid"),
      category: "hospitality",
      definition: {
        schemaVersion: "2026-03",
        block: {
          id: "blk_hero_1",
          type: "hero",
          props: { headline: "Welcome" },
          unexpected: true,
        },
      },
    },
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  expect(
    await fixture.ownerPrisma.cmsCatalogItem.count({
      where: { slug: { startsWith: slugPrefix() + "-invalid" } },
    }),
  ).toBe(0);
});

it.skipIf(!enabled)("paginates the item list with a stable cursor", async () => {
  await createDraft({ name: "First" });
  await createDraft({ name: "Second" });
  await createDraft({ name: "Third" });

  const firstPage = await send({
    method: "GET",
    path: "/items?kind=SECTION&limit=2",
    token: readToken,
  });
  expect(firstPage.status).toBe(200);
  const firstBody = z
    .object({
      success: z.literal(true),
      data: z
        .object({
          items: z.array(catalogItemSchema),
          nextCursor: z.string().nullable(),
        })
        .strict(),
      requestId: z.string(),
      timestamp: z.string(),
    })
    .strict()
    .parse(await firstPage.json());

  expect(firstBody.data.items).toHaveLength(2);
  expect(firstBody.data.nextCursor).not.toBeNull();
  if (firstBody.data.nextCursor === null) {
    throw new Error("Expected a next cursor");
  }

  const secondPage = await send({
    method: "GET",
    path: "/items?kind=SECTION&limit=2&cursor=" + encodeURIComponent(firstBody.data.nextCursor),
    token: readToken,
  });
  expect(secondPage.status).toBe(200);
  const secondBody = z
    .object({
      success: z.literal(true),
      data: z
        .object({
          items: z.array(catalogItemSchema),
          nextCursor: z.string().nullable(),
        })
        .strict(),
      requestId: z.string(),
      timestamp: z.string(),
    })
    .strict()
    .parse(await secondPage.json());

  expect(secondBody.data.items).toHaveLength(1);
  expect(secondBody.data.nextCursor).toBeNull();
  const firstIds = firstBody.data.items.map((item) => item.id);
  expect(firstIds).not.toContain(secondBody.data.items[0]?.id);
});
