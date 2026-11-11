import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { assertTenantWriteQuotaAvailable } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { QuotaExceededError } from "@suite/core/errors";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  QUOTA_RATE_LIMIT_KEY,
  QUOTA_READ_RATE_LIMIT_KEY,
  platformQuotasRouter,
} from "../../../src/routes/admin/quotas.js";
import type { QuotaItem } from "../../../src/services/admin/quota.contract.js";
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
const EMAIL_PREFIX = "quotas";
const BRANCHES_KEY = "core.branches";
const MEMBERS_KEY = "core.members";

interface Envelope<T> {
  readonly success: true;
  readonly data: T;
}

let fixture: OperatorFixture;
let managerToken: string;
let limitedToken: string;
const organizationIds: string[] = [];

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}): Promise<Response> {
  return sendOperatorRequest(platformQuotasRouter, input);
}

async function createTenant(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Quota ${label} ${fixture.suffix}`,
      slug: `quota-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  return organization.id;
}

async function readQuotas(organizationId: string): Promise<QuotaItem[]> {
  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{ items: QuotaItem[] }>;
  return body.data.items;
}

function putQuotas(
  organizationId: string,
  items: readonly {
    readonly resourceKey: string;
    readonly limitValue: string;
    readonly isEnforced: boolean;
    readonly expectedVersion: string | null;
  }[]
): Promise<Response> {
  return send({
    method: "PUT",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
    body: { items },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  platformQuotasRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(QUOTA_RATE_LIMIT_KEY);
  await clearRateLimitStore(QUOTA_READ_RATE_LIMIT_KEY);
  managerToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code])
  ).token;
  limitedToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])
  ).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(QUOTA_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  if (organizationIds.length > 0) {
    await fixture.ownerPrisma.quota.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.branch.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.auditEvent.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  await fixture.cleanup();
});

it.skipIf(!enabled)("creates a quota, reads usage and audits it", async () => {
  const organizationId = await createTenant("create");

  const response = await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "5",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);

  expect(response.status).toBe(200);
  const items = await readQuotas(organizationId);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    resourceKey: BRANCHES_KEY,
    limitValue: "5",
    unit: "count",
    currentValue: "0",
    isMeasurable: true,
    isEnforced: true,
  });

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.before).toBeNull();
  expect(audit?.after).toMatchObject({
    limitValue: "5",
    isEnforced: true,
  });
});

it.skipIf(!enabled)("refuses a stale version and keeps the current limit", async () => {
  const organizationId = await createTenant("stale");
  await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "5",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);
  const observed = (await readQuotas(organizationId))[0];

  const first = await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "10",
      isEnforced: true,
      expectedVersion: observed?.version ?? null,
    },
  ]);
  expect(first.status).toBe(200);

  const stale = await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "7",
      isEnforced: true,
      expectedVersion: observed?.version ?? null,
    },
  ]);
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(
    PLATFORM_ERROR_CODE.QUOTA_CONFLICT
  );

  const after = (await readQuotas(organizationId))[0];
  expect(after?.limitValue).toBe("10");
});

it.skipIf(!enabled)("rolls back the batch when one item is stale", async () => {
  const organizationId = await createTenant("batch");
  await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "5",
      isEnforced: true,
      expectedVersion: null,
    },
    {
      resourceKey: MEMBERS_KEY,
      limitValue: "3",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);
  const observed = await readQuotas(organizationId);
  const branches = observed.find((item) => item.resourceKey === BRANCHES_KEY);

  const response = await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "8",
      isEnforced: true,
      expectedVersion: branches?.version ?? null,
    },
    {
      resourceKey: MEMBERS_KEY,
      limitValue: "9",
      isEnforced: true,
      expectedVersion: "stale",
    },
  ]);
  expect(response.status).toBe(409);

  const after = await readQuotas(organizationId);
  expect(
    after.find((item) => item.resourceKey === BRANCHES_KEY)?.limitValue
  ).toBe("5");

  const audits = await fixture.ownerPrisma.auditEvent.count({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET,
    },
  });
  expect(audits).toBe(2);
});

it.skipIf(!enabled)("applies an idempotent quota retry exactly once", async () => {
  const organizationId = await createTenant("idempotent");
  const request = {
    method: "PUT",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
    idempotencyKey: `idem-quota-${Date.now().toString(36)}`,
    body: {
      items: [
        {
          resourceKey: BRANCHES_KEY,
          limitValue: "5",
          isEnforced: true,
          expectedVersion: null,
        },
      ],
    },
  } as const;

  const first = await send(request);
  expect(first.status).toBe(200);
  const firstBody = await first.json();

  const replay = await send(request);
  expect(replay.status).toBe(200);
  expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  expect(await replay.json()).toEqual(firstBody);

  const audits = await fixture.ownerPrisma.auditEvent.count({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET,
    },
  });
  expect(audits).toBe(1);
});

it.skipIf(!enabled)("measures and enforces storage (FR-052, FR-122)", async () => {
  const organizationId = await createTenant("storage");

  const enforced = await putQuotas(organizationId, [
    {
      resourceKey: "media.storage",
      limitValue: "1024",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);
  expect(enforced.status).toBe(200);

  const storage = (await readQuotas(organizationId))[0];
  expect(storage).toMatchObject({
    resourceKey: "media.storage",
    unit: "bytes",
    currentValue: "0",
    isMeasurable: true,
    isEnforced: true,
  });
});

it.skipIf(!enabled)("keeps quotas scoped to one tenant (FR-030)", async () => {
  const firstOrganization = await createTenant("isolated-first");
  const secondOrganization = await createTenant("isolated-second");

  await putQuotas(firstOrganization, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "5",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);

  const other = await readQuotas(secondOrganization);
  expect(other).toEqual([]);
});

async function createBranch(
  organizationId: string,
  code: string
): Promise<void> {
  await fixture.ownerPrisma.branch.create({
    data: {
      organizationId,
      name: `Branch ${code}`,
      code,
      type: "HOSPITALITY_LODGING",
    },
  });
}

it.skipIf(!enabled)("hard-blocks creation at a limit set through the API", async () => {
  const organizationId = await createTenant("hard-block");
  await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "1",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);
  await createBranch(organizationId, "HB-1");

  await expect(
    fixture.ownerPrisma.$transaction(async (tx) => {
      await assertTenantWriteQuotaAvailable(tx, {
        organizationId,
        resourceKey: BRANCHES_KEY,
      });
      await tx.branch.create({
        data: {
          organizationId,
          name: "Blocked Branch",
          code: "HB-2",
          type: "HOSPITALITY_LODGING",
        },
      });
    })
  ).rejects.toBeInstanceOf(QuotaExceededError);

  const branches = await fixture.ownerPrisma.branch.count({
    where: { organizationId },
  });
  expect(branches).toBe(1);
});

it.skipIf(!enabled)("keeps content and surfaces over-limit after an API lower", async () => {
  const organizationId = await createTenant("lowered");
  await createBranch(organizationId, "LOW-1");
  await createBranch(organizationId, "LOW-2");

  const response = await putQuotas(organizationId, [
    {
      resourceKey: BRANCHES_KEY,
      limitValue: "1",
      isEnforced: true,
      expectedVersion: null,
    },
  ]);
  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{ items: QuotaItem[] }>;
  const branches = body.data.items.find(
    (item) => item.resourceKey === BRANCHES_KEY
  );
  expect(branches).toMatchObject({
    limitValue: "1",
    currentValue: "2",
    isOverLimit: true,
  });

  const after = await readQuotas(organizationId);
  expect(after.find((item) => item.resourceKey === BRANCHES_KEY)?.isOverLimit).toBe(
    true
  );
  expect(
    await fixture.ownerPrisma.branch.count({ where: { organizationId } })
  ).toBe(2);

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.after).toMatchObject({ limitValue: "1", isEnforced: true });
});

it.skipIf(!enabled)("denies quota reads and writes without the capability", async () => {
  const organizationId = await createTenant("denied");
  const path = `/tenants/${organizationId}/quotas`;

  const read = await send({ method: "GET", path, token: limitedToken });
  expect(read.status).toBe(403);
  expect((await parseProblem(read)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );

  const write = await send({
    method: "PUT",
    path,
    token: limitedToken,
    body: {
      items: [
        {
          resourceKey: BRANCHES_KEY,
          limitValue: "5",
          isEnforced: true,
          expectedVersion: null,
        },
      ],
    },
  });
  expect(write.status).toBe(403);
});
