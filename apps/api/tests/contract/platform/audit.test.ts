import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  appendPlatformAuditEvent,
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import {
  AUDIT_EXPORT_RATE_LIMIT_KEY,
  AUDIT_SEARCH_RATE_LIMIT_KEY,
  AUDIT_VERIFY_RATE_LIMIT_KEY,
  platformAuditRouter,
} from "../../../src/routes/admin/audit.js";
import {
  auditPageSchema,
  auditVerifyResultSchema,
} from "../../../src/services/admin/audit-query.contract.js";
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

const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      success: z.literal(true),
      data,
      requestId: z.string().min(1),
      timestamp: z.string(),
    })
    .strict();

let fixture: OperatorFixture;
let managerToken: string;
let managerOperatorId: string;
let auditOnlyToken: string;
let piiOnlyToken: string;
let limitedToken: string;
let organizationId: string;
const testAction = PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET;

function searchPath(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query.length === 0 ? "/audit" : `/audit?${query}`;
}

async function seedAuditRow(index: number, minutesAgo: number): Promise<void> {
  await appendPlatformAuditEvent(fixture.ownerPrisma, {
    actorOperatorId: managerOperatorId,
    action: testAction,
    entityType: "audit_test",
    entityId: `audit-test-${fixture.suffix}-${index}`,
    organizationId,
    before: null,
    after: { index },
    reason: `contract fixture ${index}`,
    requestId: `req_audit_${fixture.suffix}_${index}`,
    occurredAt: new Date(Date.now() - minutesAgo * 60_000),
  });
}

async function seedAuditRows(): Promise<void> {
  await seedAuditRow(1, 3);
  await seedAuditRow(2, 2);
  await seedAuditRow(3, 1);
}

function controlPlaneOrigin(): string {
  const value = process.env.CONTROL_PLANE_ORIGIN;
  if (value === undefined || value.trim() === "") {
    throw new Error("CONTROL_PLANE_ORIGIN must be set for audit tests");
  }
  return value.trim();
}

function directRequest(
  path: string,
  input: {
    readonly token: string;
    readonly reason?: string;
  },
): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: controlPlaneOrigin(),
    Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${input.token}`,
  };
  if (input.reason !== undefined) {
    headers["x-pii-reason"] = input.reason;
  }
  return Promise.resolve(platformAuditRouter.request(path, { method: "GET", headers }));
}

beforeAll(async () => {
  if (!enabled) return;
  platformAuditRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("audit-contract");
  await clearRateLimitStore(AUDIT_SEARCH_RATE_LIMIT_KEY);
  await clearRateLimitStore(AUDIT_VERIFY_RATE_LIMIT_KEY);
  await clearRateLimitStore(AUDIT_EXPORT_RATE_LIMIT_KEY);

  const manager = await fixture.createOperator([
    PLATFORM_CAPABILITIES.AUDIT_READ.code,
    PLATFORM_CAPABILITIES.PII_READ.code,
  ]);
  managerToken = manager.token;
  managerOperatorId = manager.id;
  auditOnlyToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.AUDIT_READ.code])).token;
  piiOnlyToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.PII_READ.code])).token;
  limitedToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])).token;
  organizationId = `org_audit_${fixture.suffix}`;
  await seedAuditRows();
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(AUDIT_SEARCH_RATE_LIMIT_KEY);
  await clearRateLimitStore(AUDIT_VERIFY_RATE_LIMIT_KEY);
  await clearRateLimitStore(AUDIT_EXPORT_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("returns a cursor-paginated audit page with stable ordering", async () => {
  const response = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: searchPath({ organizationId, action: testAction, limit: "1" }),
    token: managerToken,
  });
  expect(response.status).toBe(200);
  const first = envelopeSchema(auditPageSchema).parse(await response.json());
  expect(first.data.items).toHaveLength(1);
  expect(first.data.nextCursor).not.toBeNull();
  expect(first.data.items[0]?.organizationId).toBe(organizationId);
  expect(first.data.items[0]).not.toHaveProperty("reason");

  const second = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: searchPath({
      organizationId,
      action: testAction,
      limit: "1",
      cursor: first.data.nextCursor ?? "",
    }),
    token: managerToken,
  });
  expect(second.status).toBe(200);
  const page = envelopeSchema(auditPageSchema).parse(await second.json());
  expect(page.data.items).toHaveLength(1);
  expect(page.data.items[0]?.id).not.toBe(first.data.items[0]?.id);
});

it.skipIf(!enabled)("rejects an invalid cursor and an inverted time range", async () => {
  const badCursor = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: searchPath({ cursor: "not-a-cursor" }),
    token: managerToken,
  });
  expect(badCursor.status).toBe(422);

  const inverted = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: searchPath({
      from: new Date(Date.now() - 60_000).toISOString(),
      to: new Date(Date.now() - 120_000).toISOString(),
    }),
    token: managerToken,
  });
  expect(inverted.status).toBe(422);
  expect((await parseProblem(inverted)).code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
});

it.skipIf(!enabled)("verifies the global audit chain", async () => {
  const response = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: "/audit/verify",
    token: managerToken,
  });
  expect(response.status).toBe(200);
  const body = envelopeSchema(auditVerifyResultSchema).parse(await response.json());
  expect(typeof body.data.verified).toBe("boolean");
  // The chain is global and append-only, but every Platform suite removes its
  // own audit rows in cleanup. On a fresh database that removes the chain head,
  // so the verifier correctly reports the first break instead of walking this
  // suite's rows. Assert the real contract in both states: an intact chain must
  // have walked at least the three seeded rows, and a broken one must name the
  // break rather than silently reporting success.
  if (body.data.verified) {
    expect(body.data.checkedCount).toBeGreaterThanOrEqual(3);
    expect(body.data.firstBrokenId).toBeNull();
  } else {
    expect(body.data.checkedCount).toBeGreaterThanOrEqual(1);
    expect(body.data.firstBrokenId).not.toBeNull();
  }
});

it.skipIf(!enabled)("denies search and verify without platform:audit:read", async () => {
  const search = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: "/audit",
    token: limitedToken,
  });
  expect(search.status).toBe(403);

  const verify = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: "/audit/verify",
    token: limitedToken,
  });
  expect(verify.status).toBe(403);
});

it.skipIf(!enabled)("requires both audit read and PII read for export", async () => {
  const auditOnly = await directRequest("/audit/export", { token: auditOnlyToken });
  expect(auditOnly.status).toBe(403);

  const piiOnly = await directRequest("/audit/export", { token: piiOnlyToken });
  expect(piiOnly.status).toBe(403);

  const missingReason = await directRequest("/audit/export", { token: managerToken });
  expect(missingReason.status).toBe(422);
  expect((await parseProblem(missingReason)).code).toBe(PLATFORM_ERROR_CODE.PII_REASON_REQUIRED);
});

it.skipIf(!enabled)("exports filtered CSV with the recorded reason", async () => {
  const response = await directRequest(
    `/audit/export?${new URLSearchParams({
      organizationId,
      action: testAction,
    }).toString()}`,
    { token: managerToken, reason: "investigation ticket 42" },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/csv");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(response.headers.get("cache-control")).toBe("no-store");

  const csv = await response.text();
  expect(csv.startsWith("id,occurredAt,actorOperatorId")).toBe(true);
  expect(csv).toContain("contract fixture 1");
  expect(csv.split("\r\n").filter((line) => line.length > 0)).toHaveLength(4);

  const exported = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.AUDIT_EXPORTED,
      actorOperatorId: managerOperatorId,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(exported?.reason).toBe("investigation ticket 42");
  expect(exported?.after).toMatchObject({ rowCount: 3 });
});

it.skipIf(!enabled)("redacts payloads when PII is held without a recorded reason", async () => {
  const response = await directRequest(
    searchPath({ organizationId, action: testAction, limit: "10" }),
    { token: managerToken },
  );
  expect(response.status).toBe(200);
  const page = envelopeSchema(auditPageSchema).parse(await response.json());
  expect(page.data.items.length).toBeGreaterThan(0);
  for (const item of page.data.items) {
    expect(item.before).toBeNull();
    expect(item.after).toBeNull();
  }
});

it.skipIf(!enabled)("discloses payloads and records AUDIT_SEARCHED when a reason is supplied", async () => {
  const reason = "Investigating support ticket 1234";
  const before = await fixture.ownerPrisma.auditEvent.count({
    where: { action: PLATFORM_AUDIT_ACTIONS.AUDIT_SEARCHED },
  });
  const response = await directRequest(
    searchPath({ organizationId, action: testAction, limit: "10" }),
    { token: managerToken, reason },
  );
  expect(response.status).toBe(200);
  const page = envelopeSchema(auditPageSchema).parse(await response.json());
  expect(page.data.items.some((item) => item.after !== null)).toBe(true);

  const rows = await fixture.ownerPrisma.auditEvent.findMany({
    where: { action: PLATFORM_AUDIT_ACTIONS.AUDIT_SEARCHED },
    orderBy: { occurredAt: "desc" },
    take: 1,
  });
  expect(rows).toHaveLength(1);
  expect(before + 1).toBe(
    await fixture.ownerPrisma.auditEvent.count({
      where: { action: PLATFORM_AUDIT_ACTIONS.AUDIT_SEARCHED },
    }),
  );
  expect(rows[0]?.reason).toBe(reason);
  expect(rows[0]?.entityId).toBe(organizationId);
});

it.skipIf(!enabled)("rejects an undersized PII reason", async () => {
  const response = await directRequest(
    searchPath({ organizationId, action: testAction, limit: "1" }),
    { token: managerToken, reason: "why" },
  );
  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.VALIDATION_FAILED,
  );
});
