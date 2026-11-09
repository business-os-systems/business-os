import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { CATALOG_KEYS, PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  platformCatalogsRouter,
  REFERENCE_CATALOG_RATE_LIMIT_KEY,
  REFERENCE_CATALOG_READ_RATE_LIMIT_KEY,
} from "../../../src/routes/admin/catalogs.js";
import { catalogValueSchema } from "../../../src/services/admin/catalog-admin.contract.js";
import {
  referenceRouter,
  REFERENCE_READ_RATE_LIMIT_KEY,
} from "../../../src/routes/reference.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { createCatalogCache, redis } from "@suite/redis";
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

const envelopeSchema = z
  .object({
    success: z.literal(true),
    data: catalogValueSchema,
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

const referenceListSchema = z
  .object({
    data: z
      .object({
        catalogs: z.array(
          z
            .object({
              key: z.string(),
              values: z.array(z.object({ code: z.string() }).passthrough()),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

function referenceCodes(body: unknown, catalogKey: string): readonly string[] {
  const parsed = referenceListSchema.parse(body);
  const catalog = parsed.data.catalogs.find((item) => item.key === catalogKey);
  return catalog?.values.map((value) => value.code) ?? [];
}

const catalogCache = createCatalogCache(redis);

let fixture: OperatorFixture;
let managerToken: string;
let managerOperatorId: string;
const createdValues: { catalogKey: string; code: string }[] = [];

function uniqueTestCode(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformCatalogsRouter, input);
}

async function createValue(label: string): Promise<{
  readonly code: string;
  readonly version: number;
}> {
  const code = uniqueTestCode("zz_integration");
  const response = await send({
    method: "POST",
    path: "/branch_type/values",
    token: managerToken,
    body: { code: code.toUpperCase(), label },
  });
  expect(response.status).toBe(200);
  const parsed = envelopeSchema.parse(await response.json());
  createdValues.push({ catalogKey: "branch_type", code: parsed.data.code });
  return { code: parsed.data.code, version: parsed.data.version };
}

function auditCount(entityId: string): Promise<number> {
  return fixture.ownerPrisma.auditEvent.count({
    where: { entityId, action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_UPDATED },
  });
}

function createAuditCount(entityId: string): Promise<number> {
  return fixture.ownerPrisma.auditEvent.count({
    where: { entityId, action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_CREATED },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  platformCatalogsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("catalog-integration");
  await clearRateLimitStore(REFERENCE_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(REFERENCE_CATALOG_READ_RATE_LIMIT_KEY);

  await fixture.ownerPrisma.catalog.createMany({
    data: CATALOG_KEYS.map((key) => ({
      key,
      label: key,
      description: null,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  const manager = await fixture.createOperator([PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code]);
  managerToken = manager.token;
  managerOperatorId = manager.id;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(REFERENCE_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(REFERENCE_CATALOG_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(REFERENCE_READ_RATE_LIMIT_KEY);
  await Promise.all(CATALOG_KEYS.map((key) => catalogCache.invalidate(key)));
  await catalogCache.invalidate(null);
});

afterAll(async () => {
  if (!enabled) return;
  if (createdValues.length > 0) {
    await fixture.ownerPrisma.catalogValue.deleteMany({
      where: { OR: createdValues },
    });
  }
  await fixture.cleanup();
});

it.skipIf(!enabled)("creates a normalized value and audits it once", async () => {
  const created = await createValue("Integration Currency");
  const entityId = `branch_type:${created.code}`;

  const row = await fixture.ownerPrisma.catalogValue.findUnique({
    where: {
      catalogKey_code: { catalogKey: "branch_type", code: created.code },
    },
  });
  expect(row).toMatchObject({
    label: "Integration Currency",
    sortOrder: 0,
    isActive: true,
    version: 1,
    createdBy: managerOperatorId,
    updatedBy: managerOperatorId,
  });

  expect(await createAuditCount(entityId)).toBe(1);
  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: { entityId, action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_CREATED },
  });
  expect(audit?.before).toBeNull();
  expect(audit?.after).toMatchObject({
    label: "Integration Currency",
    isActive: true,
  });
});

it.skipIf(!enabled)("rejects a duplicate without a second audit or row", async () => {
  const created = await createValue("Duplicate Integration");
  const entityId = `branch_type:${created.code}`;
  const auditBefore = await createAuditCount(entityId);

  const response = await send({
    method: "POST",
    path: "/branch_type/values",
    token: managerToken,
    body: { code: created.code, label: "Duplicate again" },
  });

  expect(response.status).toBe(409);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.DUPLICATE_CODE);
  expect(await createAuditCount(entityId)).toBe(auditBefore);
  expect(
    await fixture.ownerPrisma.catalogValue.count({
      where: { catalogKey: "branch_type", code: created.code },
    }),
  ).toBe(1);
});

it.skipIf(!enabled)("retires a value without deleting it", async () => {
  const created = await createValue("Retire Integration");
  const entityId = `branch_type:${created.code}`;

  const response = await send({
    method: "PATCH",
    path: `/branch_type/values/${created.code}`,
    token: managerToken,
    body: { isActive: false, expectedVersion: created.version },
  });
  expect(response.status).toBe(200);

  const row = await fixture.ownerPrisma.catalogValue.findUnique({
    where: {
      catalogKey_code: { catalogKey: "branch_type", code: created.code },
    },
  });
  expect(row?.isActive).toBe(false);
  expect(row?.version).toBe(created.version + 1);
  expect(await auditCount(entityId)).toBe(1);

  const list = await send({ method: "GET", path: "/", token: managerToken });
  expect(list.status).toBe(200);
  const body = (await list.json()) as {
    data: { catalogs: { values: { code: string }[] }[] };
  };
  expect(
    body.data.catalogs.some((catalog) =>
      catalog.values.some((value) => value.code === created.code),
    ),
  ).toBe(true);

  const activeView = await fixture.ownerPrisma.$queryRaw<{ code: string }[]>`
    SELECT "code"
    FROM reference."v_active_catalog_values"
    WHERE "catalogKey" = 'branch_type' AND "code" = ${created.code}
  `;
  expect(activeView).toHaveLength(0);
});

it.skipIf(!enabled)("rejects a stale write without writing or auditing", async () => {
  const created = await createValue("Stale Integration");
  const entityId = `branch_type:${created.code}`;

  const updated = await send({
    method: "PATCH",
    path: `/branch_type/values/${created.code}`,
    token: managerToken,
    body: { label: "New label", expectedVersion: created.version },
  });
  expect(updated.status).toBe(200);

  const stale = await send({
    method: "PATCH",
    path: `/branch_type/values/${created.code}`,
    token: managerToken,
    body: { label: "Stale label", expectedVersion: created.version },
  });
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(PLATFORM_ERROR_CODE.CATALOG_VERSION_CONFLICT);

  const row = await fixture.ownerPrisma.catalogValue.findUnique({
    where: {
      catalogKey_code: { catalogKey: "branch_type", code: created.code },
    },
  });
  expect(row?.label).toBe("New label");
  expect(row?.version).toBe(created.version + 1);
  expect(await auditCount(entityId)).toBe(1);
});

it.skipIf(!enabled)("serializes two concurrent updates with one winner", async () => {
  const created = await createValue("Concurrent Integration");
  const entityId = `branch_type:${created.code}`;

  const responses = await Promise.all([
    send({
      method: "PATCH",
      path: `/branch_type/values/${created.code}`,
      token: managerToken,
      body: { label: "Winner A", expectedVersion: created.version },
    }),
    send({
      method: "PATCH",
      path: `/branch_type/values/${created.code}`,
      token: managerToken,
      body: { label: "Winner B", expectedVersion: created.version },
    }),
  ]);

  const statuses = responses.map((response) => response.status).sort();
  expect(statuses).toEqual([200, 409]);

  const row = await fixture.ownerPrisma.catalogValue.findUnique({
    where: {
      catalogKey_code: { catalogKey: "branch_type", code: created.code },
    },
  });
  expect(row?.version).toBe(created.version + 1);
  expect(["Winner A", "Winner B"]).toContain(row?.label);
  expect(await auditCount(entityId)).toBe(1);
});

it.skipIf(!enabled)("invalidates the reference read cache after a catalog change", async () => {
  const warm = await sendOperatorRequest(referenceRouter, {
    method: "GET",
    path: "/catalogs",
    token: managerToken,
  });
  expect(warm.status).toBe(200);
  const cached = await catalogCache.read({
    catalogKey: null,
    parse: (value) => value,
  });
  expect(cached).not.toBeNull();

  const created = await createValue("Cache Invalidation Integration");
  const afterMutation = await catalogCache.read({
    catalogKey: null,
    parse: (value) => value,
  });
  expect(afterMutation).toBeNull();

  const after = await sendOperatorRequest(referenceRouter, {
    method: "GET",
    path: "/catalogs",
    token: managerToken,
  });
  expect(after.status).toBe(200);
  expect(referenceCodes(await after.json(), "branch_type")).toContain(created.code);
});

it.skipIf(!enabled)("returns 404 for a missing value", async () => {
  const response = await send({
    method: "PATCH",
    path: "/branch_type/values/zz_missing",
    token: managerToken,
    body: { label: "Missing", expectedVersion: 1 },
  });

  expect(response.status).toBe(404);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.UNKNOWN_CATALOG);
});

it.skipIf(!enabled)("normalizes the code in the path", async () => {
  const created = await createValue("Path Integration");

  const response = await send({
    method: "PATCH",
    path: `/branch_type/values/${created.code.toUpperCase()}`,
    token: managerToken,
    body: { label: "Path normalized", expectedVersion: created.version },
  });

  expect(response.status).toBe(200);
  const parsed = envelopeSchema.parse(await response.json());
  expect(parsed.data.code).toBe(created.code);
  expect(parsed.data.label).toBe("Path normalized");
});
