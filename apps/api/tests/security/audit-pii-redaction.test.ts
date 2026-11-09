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
  platformAuditRouter,
} from "../../src/routes/admin/audit.js";
import { auditPageSchema } from "../../src/services/admin/audit-query.contract.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../src/middleware/rate-limit.js";
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

const envelopeSchema = z
  .object({
    success: z.literal(true),
    data: auditPageSchema,
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

let fixture: OperatorFixture;
let managerToken: string;
let managerOperatorId: string;
let auditOnlyToken: string;
let piiOnlyToken: string;
let organizationId: string;
const testAction = PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET;

function auditFilters(): string {
  return new URLSearchParams({ organizationId, action: testAction }).toString();
}

function searchPath(): string {
  return `/audit?${auditFilters()}`;
}

function exportPath(): string {
  return `/audit/export?${auditFilters()}`;
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

async function searchAudit(token: string): Promise<z.infer<typeof envelopeSchema>> {
  const response = await sendOperatorRequest(platformAuditRouter, {
    method: "GET",
    path: searchPath(),
    token,
  });
  expect(response.status).toBe(200);
  return envelopeSchema.parse(await response.json());
}

async function seedAuditRow(index: number, minutesAgo: number): Promise<void> {
  await appendPlatformAuditEvent(fixture.ownerPrisma, {
    actorOperatorId: managerOperatorId,
    action: testAction,
    entityType: "audit_test",
    entityId: `audit-pii-${fixture.suffix}-${index}`,
    organizationId,
    before: { priorIndex: index },
    after: { index },
    reason: `pii redaction fixture ${index}`,
    requestId: `req_audit_pii_${fixture.suffix}_${index}`,
    occurredAt: new Date(Date.now() - minutesAgo * 60_000),
  });
}

beforeAll(async () => {
  if (!enabled) return;
  platformAuditRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("audit-pii-redaction");
  await clearRateLimitStore(AUDIT_SEARCH_RATE_LIMIT_KEY);
  await clearRateLimitStore(AUDIT_EXPORT_RATE_LIMIT_KEY);

  const manager = await fixture.createOperator([
    PLATFORM_CAPABILITIES.AUDIT_READ.code,
    PLATFORM_CAPABILITIES.PII_READ.code,
  ]);
  managerToken = manager.token;
  managerOperatorId = manager.id;
  auditOnlyToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.AUDIT_READ.code])).token;
  piiOnlyToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.PII_READ.code])).token;
  organizationId = `org_audit_pii_${fixture.suffix}`;

  await seedAuditRow(1, 2);
  await seedAuditRow(2, 1);
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(AUDIT_SEARCH_RATE_LIMIT_KEY);
  await clearRateLimitStore(AUDIT_EXPORT_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("redacts before/after for an operator without platform:pii:read", async () => {
  const page = await searchAudit(auditOnlyToken);

  expect(page.data.items).toHaveLength(2);
  for (const item of page.data.items) {
    expect(item.before).toBeNull();
    expect(item.after).toBeNull();
    expect(item.action).toBe(testAction);
    expect(item.entityType).toBe("audit_test");
    expect(item.requestId.length).toBeGreaterThan(0);
    expect(item.recordHash.length).toBeGreaterThan(0);
  }
});

it.skipIf(!enabled)("returns before/after to an operator holding platform:pii:read", async () => {
  const page = await searchAudit(managerToken);

  expect(page.data.items).toHaveLength(2);
  expect(page.data.items[0]?.before).toEqual({ priorIndex: 2 });
  expect(page.data.items[0]?.after).toEqual({ index: 2 });
  expect(page.data.items[1]?.before).toEqual({ priorIndex: 1 });
  expect(page.data.items[1]?.after).toEqual({ index: 1 });
});

it.skipIf(!enabled)("keeps the export gated on both platform capabilities", async () => {
  const auditOnly = await directRequest(exportPath(), {
    token: auditOnlyToken,
    reason: "security regression ticket 293",
  });
  expect(auditOnly.status).toBe(403);
  expect((await parseProblem(auditOnly)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);

  const piiOnly = await directRequest(exportPath(), {
    token: piiOnlyToken,
    reason: "security regression ticket 293",
  });
  expect(piiOnly.status).toBe(403);
  expect((await parseProblem(piiOnly)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);

  const missingReason = await directRequest(exportPath(), { token: managerToken });
  expect(missingReason.status).toBe(422);
  expect((await parseProblem(missingReason)).code).toBe(
    PLATFORM_ERROR_CODE.PII_REASON_REQUIRED,
  );
});
