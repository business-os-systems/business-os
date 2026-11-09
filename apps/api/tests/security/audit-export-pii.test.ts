import { afterAll, beforeAll, expect, it } from "vitest";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  appendPlatformAuditEvent,
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import { platformAuditRouter } from "../../src/routes/admin/audit.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  type OperatorFixture,
} from "../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();

let fixture: OperatorFixture;
let managerToken: string;
let managerOperatorId: string;
let auditOnlyToken: string;
let piiOnlyToken: string;
let organizationId: string;
const testAction = PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET;
const maliciousEntityId = "audit-injection-row";

function controlPlaneOrigin(): string {
  const value = process.env.CONTROL_PLANE_ORIGIN;
  if (value === undefined || value.trim() === "") {
    throw new Error("CONTROL_PLANE_ORIGIN must be set for audit tests");
  }
  return value.trim();
}

function exportPath(): string {
  return `/audit/export?${new URLSearchParams({
    organizationId,
    action: testAction,
  }).toString()}`;
}

function requestExport(input: {
  readonly token: string;
  readonly reason?: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: controlPlaneOrigin(),
    Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${input.token}`,
  };
  if (input.reason !== undefined) {
    headers["x-pii-reason"] = input.reason;
  }
  return Promise.resolve(platformAuditRouter.request(exportPath(), { method: "GET", headers }));
}

beforeAll(async () => {
  if (!enabled) return;
  platformAuditRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("audit-export-pii");

  const manager = await fixture.createOperator([
    PLATFORM_CAPABILITIES.AUDIT_READ.code,
    PLATFORM_CAPABILITIES.PII_READ.code,
  ]);
  managerToken = manager.token;
  managerOperatorId = manager.id;
  auditOnlyToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.AUDIT_READ.code])).token;
  piiOnlyToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.PII_READ.code])).token;
  organizationId = `org_audit_export_${fixture.suffix}`;

  await appendPlatformAuditEvent(fixture.ownerPrisma, {
    actorOperatorId: managerOperatorId,
    action: testAction,
    entityType: "audit_test",
    entityId: maliciousEntityId,
    organizationId,
    before: null,
    after: { safe: true },
    reason: '=HYPERLINK("http://example.test")',
    requestId: `req_audit_export_${fixture.suffix}`,
  });
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("refuses the export without platform:pii:read", async () => {
  const response = await requestExport({ token: auditOnlyToken });

  expect(response.status).toBe(403);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
});

it.skipIf(!enabled)("refuses the export without platform:audit:read", async () => {
  const response = await requestExport({ token: piiOnlyToken });

  expect(response.status).toBe(403);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
});

it.skipIf(!enabled)("requires a recorded PII reason", async () => {
  const response = await requestExport({ token: managerToken });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.PII_REASON_REQUIRED);
});

it.skipIf(!enabled)("neutralizes spreadsheet formulas in exported cells", async () => {
  const response = await requestExport({
    token: managerToken,
    reason: "security regression ticket 7",
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const csv = await response.text();
  const row = csv.split("\r\n").find((line) => line.includes(maliciousEntityId));
  expect(row).toBeDefined();
  expect(row).toContain("'=HYPERLINK");
  expect(row).not.toContain(',"=HYPERLINK');
});
