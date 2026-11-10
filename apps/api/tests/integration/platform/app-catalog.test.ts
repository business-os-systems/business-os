import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { PlatformAppAvailability } from "@suite/db";
import {
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import {
  CATALOG_RATE_LIMIT_KEY,
  CATALOG_READ_RATE_LIMIT_KEY,
  platformAppCatalogRouter,
} from "../../../src/routes/admin/app-catalog.js";
import {
  APP_CATALOG_AVAILABILITIES,
  type CatalogApp,
} from "../../../src/services/admin/app-catalog.contract.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const APP_ID = "website-builder";
const GHOST_APP = "ghost-app";

/**
 * An independent contract schema: the route's own Zod schema is exercised by
 * the OpenAPI layer, while this one proves the wire shape did not drift.
 */
const catalogEntrySchema = z
  .object({
    appId: z.string().min(1),
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1).nullable(),
    availability: z.enum(["HIDDEN", "PREVIEW", "AVAILABLE", "RETIRED"]),
    sortOrder: z.number().int().nonnegative(),
    installedCount: z.number().int().nonnegative(),
    version: z.string().min(1).nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

const catalogEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ apps: z.array(catalogEntrySchema) }).strict(),
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

const entryEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: catalogEntrySchema,
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

interface OverrideSnapshot {
  readonly id: string;
  readonly appId: string;
  readonly availability: "HIDDEN" | "PREVIEW" | "AVAILABLE" | "RETIRED";
  readonly sortOrder: number;
  readonly category: string | null;
  readonly updatedBy: string;
  readonly updatedAt: Date;
}

let fixture: OperatorFixture;
let managerToken: string;
let readerToken: string;
let limitedToken: string;
let managerOperatorId: string;
let originalOverride: OverrideSnapshot | null = null;
const organizationIds: string[] = [];

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}): Promise<Response> {
  return sendOperatorRequest(platformAppCatalogRouter, input);
}

function patch(body: unknown, idempotencyKey?: string): Promise<Response> {
  return send({
    method: "PATCH",
    path: `/${APP_ID}`,
    token: managerToken,
    body,
    idempotencyKey,
  });
}

async function readCatalog(): Promise<CatalogApp[]> {
  const response = await send({ method: "GET", path: "/", token: readerToken });
  expect(response.status).toBe(200);
  const body = catalogEnvelopeSchema.parse(await response.json());
  return body.data.apps;
}

async function readEntry(): Promise<CatalogApp | undefined> {
  return (await readCatalog()).find((entry) => entry.appId === APP_ID);
}

function auditCount(appId = APP_ID): Promise<number> {
  return fixture.ownerPrisma.auditEvent.count({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.APP_CATALOG_OVERRIDE_SET,
      entityId: appId,
    },
  });
}

async function createTenantWithApp(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Catalog ${label} ${fixture.suffix}`,
      slug: `catalog-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  await fixture.ownerPrisma.installedApp.create({
    data: { organizationId: organization.id, appId: APP_ID },
  });
  return organization.id;
}

function controlPlaneOrigin(): string {
  const value = process.env.CONTROL_PLANE_ORIGIN;
  if (value === undefined || value.trim() === "") {
    throw new Error("CONTROL_PLANE_ORIGIN must be set for catalog tests");
  }
  return value.trim();
}

beforeAll(async () => {
  if (!enabled) return;
  platformAppCatalogRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("app-catalog");
  await clearRateLimitStore(CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(CATALOG_READ_RATE_LIMIT_KEY);

  const manager = await fixture.createOperator([
    PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
  ]);
  managerToken = manager.token;
  managerOperatorId = manager.id;
  readerToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_READ.code])
  ).token;
  limitedToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])
  ).token;

  originalOverride = await fixture.ownerPrisma.appOverride.findUnique({
    where: { appId: APP_ID },
  });
  await fixture.ownerPrisma.appOverride.deleteMany({
    where: { appId: { in: [APP_ID, GHOST_APP] } },
  });
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(CATALOG_RATE_LIMIT_KEY);
  await fixture.ownerPrisma.appOverride.deleteMany({
    where: { appId: { in: [APP_ID, GHOST_APP] } },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.ownerPrisma.appOverride.deleteMany({
    where: { appId: { in: [APP_ID, GHOST_APP] } },
  });
  if (originalOverride !== null) {
    await fixture.ownerPrisma.appOverride.create({ data: originalOverride });
  }
  if (organizationIds.length > 0) {
    await fixture.ownerPrisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  await fixture.cleanup();
});

it("keeps the contract availability list aligned with the database enum", () => {
  expect([...APP_CATALOG_AVAILABILITIES].sort()).toEqual(
    [...Object.values(PlatformAppAvailability)].sort()
  );
});

it.skipIf(!enabled)("lists the compiled registry with availability and installedCount", async () => {
  await createTenantWithApp("list");

  const apps = await readCatalog();
  const entry = apps.find((app) => app.appId === APP_ID);

  expect(entry).toBeDefined();
  expect(entry).toMatchObject({
    appId: APP_ID,
    availability: "AVAILABLE",
    sortOrder: 0,
    version: null,
    updatedAt: null,
  });
  expect(entry?.installedCount).toBeGreaterThanOrEqual(1);
});

it.skipIf(!enabled)("creates an override and audits before and after", async () => {
  const before = await auditCount();

  const response = await patch({
    availability: "HIDDEN",
    sortOrder: 3,
    category: "content",
    expectedVersion: null,
  });
  expect(response.status).toBe(200);

  const body = entryEnvelopeSchema.parse(await response.json());
  expect(body.data).toMatchObject({
    appId: APP_ID,
    availability: "HIDDEN",
    sortOrder: 3,
    category: "content",
  });
  expect(body.data.version).toMatch(/\.\d{6}Z$/);
  expect(body.data.updatedAt).not.toBeNull();

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.APP_CATALOG_OVERRIDE_SET,
      entityId: APP_ID,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.before).toBeNull();
  expect(audit?.after).toMatchObject({
    availability: "HIDDEN",
    sortOrder: 3,
    category: "content",
  });
  expect(await auditCount()).toBe(before + 1);
});

it.skipIf(!enabled)("rejects a stale version and keeps the current override", async () => {
  const before = await auditCount();
  const created = await patch({
    availability: "PREVIEW",
    expectedVersion: null,
  });
  const createdBody = entryEnvelopeSchema.parse(await created.json());
  const observedVersion = createdBody.data.version;

  const updated = await patch({
    availability: "HIDDEN",
    expectedVersion: observedVersion,
  });
  expect(updated.status).toBe(200);

  const stale = await patch({
    availability: "RETIRED",
    expectedVersion: observedVersion,
  });
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(
    PLATFORM_ERROR_CODE.VERSION_CONFLICT
  );

  expect((await readEntry())?.availability).toBe("HIDDEN");
  expect(await auditCount()).toBe(before + 2);
});

it.skipIf(!enabled)("applies an idempotent catalog retry exactly once", async () => {
  const before = await auditCount();
  const key = `catalog-idem-${Date.now().toString(36)}`;
  const request = {
    availability: "PREVIEW",
    sortOrder: 2,
    expectedVersion: null,
  };

  const first = await patch(request, key);
  expect(first.status).toBe(200);
  const firstBody = await first.json();

  const replay = await patch(request, key);
  expect(replay.status).toBe(200);
  expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  expect(await replay.json()).toEqual(firstBody);
  expect(await auditCount()).toBe(before + 1);
});

it.skipIf(!enabled)("rejects an unregistered application without writing", async () => {
  const response = await send({
    method: "PATCH",
    path: `/${GHOST_APP}`,
    token: managerToken,
    body: { availability: "HIDDEN", expectedVersion: null },
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_APP
  );
  expect(
    await fixture.ownerPrisma.appOverride.count({ where: { appId: GHOST_APP } })
  ).toBe(0);
  expect(await auditCount(GHOST_APP)).toBe(0);
});

it.skipIf(!enabled)("never displays an override for an app outside the registry", async () => {
  await fixture.ownerPrisma.appOverride.create({
    data: {
      appId: GHOST_APP,
      availability: "HIDDEN",
      sortOrder: 1,
      category: null,
      updatedBy: managerOperatorId,
    },
  });

  const apps = await readCatalog();
  expect(apps.some((app) => app.appId === GHOST_APP)).toBe(false);
});

it.skipIf(!enabled)("hiding an app never disables an existing installation", async () => {
  const organizationId = await createTenantWithApp("hidden");

  const response = await patch({
    availability: "HIDDEN",
    expectedVersion: null,
  });
  expect(response.status).toBe(200);

  const installed = await fixture.ownerPrisma.installedApp.findUnique({
    where: {
      organizationId_appId: { organizationId, appId: APP_ID },
    },
  });
  expect(installed?.isEnabled).toBe(true);
});

it.skipIf(!enabled)("keeps read access for an entitlement manager", async () => {
  const read = await send({ method: "GET", path: "/", token: managerToken });
  expect(read.status).toBe(200);
  const body = catalogEnvelopeSchema.parse(await read.json());
  expect(body.data.apps.length).toBeGreaterThan(0);
});

it.skipIf(!enabled)("allows a read-only operator to read but never to write", async () => {
  const read = await send({ method: "GET", path: "/", token: readerToken });
  expect(read.status).toBe(200);

  const write = await send({
    method: "PATCH",
    path: `/${APP_ID}`,
    token: readerToken,
    body: { availability: "HIDDEN", expectedVersion: null },
    idempotencyKey: `catalog-readonly-${Date.now().toString(36)}`,
  });
  expect(write.status).toBe(403);
  expect((await parseProblem(write)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );
});

it.skipIf(!enabled)("denies catalog reads and writes without the capability", async () => {
  const read = await send({ method: "GET", path: "/", token: limitedToken });
  expect(read.status).toBe(403);
  expect((await parseProblem(read)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );

  const write = await send({
    method: "PATCH",
    path: `/${APP_ID}`,
    token: limitedToken,
    body: { availability: "HIDDEN", expectedVersion: null },
    idempotencyKey: `catalog-denied-${Date.now().toString(36)}`,
  });
  expect(write.status).toBe(403);
});

it.skipIf(!enabled)("requires an Idempotency-Key on the catalog mutation", async () => {
  const response = await platformAppCatalogRouter.request(`/${APP_ID}`, {
    method: "PATCH",
    headers: {
      Origin: controlPlaneOrigin(),
      Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${managerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ availability: "HIDDEN", expectedVersion: null }),
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED
  );
});
