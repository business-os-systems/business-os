import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { CATALOG_KEYS, PLATFORM_CAPABILITIES } from "@suite/core";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  platformCatalogsRouter,
  REFERENCE_CATALOG_RATE_LIMIT_KEY,
  REFERENCE_CATALOG_READ_RATE_LIMIT_KEY,
} from "../../../src/routes/admin/catalogs.js";
import { catalogValueSchema } from "../../../src/services/admin/catalog-admin.contract.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
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

async function createValue(): Promise<{ readonly code: string; readonly version: number }> {
  const code = uniqueTestCode("zz_audit");
  const response = await send({
    method: "POST",
    path: "/branch_type/values",
    token: managerToken,
    body: { code, label: "Audit Value", metadata: { source: "test" } },
  });
  expect(response.status).toBe(200);
  const parsed = envelopeSchema.parse(await response.json());
  createdValues.push({ catalogKey: "branch_type", code: parsed.data.code });
  return { code: parsed.data.code, version: parsed.data.version };
}

beforeAll(async () => {
  if (!enabled) return;
  platformCatalogsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("catalog-audit");
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

it.skipIf(!enabled)("writes exactly one audit row for a create", async () => {
  const created = await createValue();
  const entityId = `branch_type:${created.code}`;

  const rows = await fixture.ownerPrisma.auditEvent.findMany({
    where: { entityId },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    actorOperatorId: managerOperatorId,
    action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_CREATED,
    entityType: "catalog_value",
    entityId,
    before: null,
  });
  expect(rows[0]?.after).toMatchObject({
    label: "Audit Value",
    isActive: true,
    metadata: { source: "test" },
  });
});

it.skipIf(!enabled)(
  "writes exactly one audit row for an update with before and after",
  async () => {
    const created = await createValue();
    const entityId = `branch_type:${created.code}`;

    const response = await send({
      method: "PATCH",
      path: `/branch_type/values/${created.code}`,
      token: managerToken,
      body: {
        label: "Audited label",
        isActive: false,
        expectedVersion: created.version,
      },
    });
    expect(response.status).toBe(200);

    const rows = await fixture.ownerPrisma.auditEvent.findMany({
      where: { entityId, action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_UPDATED },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toMatchObject({
      label: "Audit Value",
      isActive: true,
    });
    expect(rows[0]?.after).toMatchObject({
      label: "Audited label",
      isActive: false,
    });
    expect(rows[0]?.actorOperatorId).toBe(managerOperatorId);
  },
);

it.skipIf(!enabled)("does not write an audit row when the version is stale", async () => {
  const created = await createValue();
  const entityId = `branch_type:${created.code}`;

  await send({
    method: "PATCH",
    path: `/branch_type/values/${created.code}`,
    token: managerToken,
    body: { label: "First", expectedVersion: created.version },
  });

  await send({
    method: "PATCH",
    path: `/branch_type/values/${created.code}`,
    token: managerToken,
    body: { label: "Stale", expectedVersion: created.version },
  });

  const rows = await fixture.ownerPrisma.auditEvent.findMany({
    where: { entityId, action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_UPDATED },
  });
  expect(rows).toHaveLength(1);
});
