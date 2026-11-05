import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import {
  PLATFORM_AUDIT_ACTIONS,
  verifyControlSession,
} from "@suite/auth/platform";
import {
  OPERATOR_RATE_LIMIT_KEY,
  platformOperatorsRouter,
} from "../../../src/routes/admin/operators.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  sendOperatorRequest,
  platformOperatorTestsEnabled,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const EMAIL_PREFIX = "operator-capabilities";
const TARGET_PLACEHOLDER = "__TARGET__";

const DENIED_ROUTES = [
  ["list", { method: "GET", path: "/" }],
  [
    "invite",
    {
      method: "POST",
      path: "/",
      body: {
        email: `${EMAIL_PREFIX}-denied@example.com`,
        displayName: "Denied",
        capabilities: [],
      },
    },
  ],
  [
    "change status",
    {
      method: "PATCH",
      path: `/${TARGET_PLACEHOLDER}`,
      body: {
        status: "SUSPENDED",
        expectedStatus: "ACTIVE",
        reason: "Denied probe",
      },
    },
  ],
  [
    "change capabilities",
    {
      method: "PATCH",
      path: `/${TARGET_PLACEHOLDER}/capabilities`,
      body: { grant: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code] },
    },
  ],
  [
    "list sessions",
    { method: "GET", path: `/${TARGET_PLACEHOLDER}/sessions` },
  ],
  [
    "revoke a session",
    {
      method: "DELETE",
      path: `/${TARGET_PLACEHOLDER}/sessions/session_probe`,
    },
  ],
] as const;

let fixture: OperatorFixture;
let managerToken: string;
let managerId: string;
let limitedToken: string;
let telemetryToken: string;

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformOperatorsRouter, input);
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(OPERATOR_RATE_LIMIT_KEY);
  const manager = await fixture.createOperator([
    PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
  ]);
  managerId = manager.id;
  managerToken = manager.token;
  limitedToken = (await fixture.createOperator([])).token;
  telemetryToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TELEMETRY_READ.code])
  ).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(OPERATOR_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

describe.skipIf(!enabled)("operator route denial", () => {
  it.each(DENIED_ROUTES)(
    "denies %s without platform:operators:manage",
    async (_name, entry) => {
      const response = await send({
        ...entry,
        path: entry.path.replace(TARGET_PLACEHOLDER, managerId),
        token: limitedToken,
      });
      expect(response.status).toBe(403);
      expect((await parseProblem(response)).code).toBe(
        PLATFORM_ERROR_CODE.CAPABILITY_DENIED
      );
    }
  );
});

it.skipIf(!enabled)("denies a non-empty but wrong capability set", async () => {
  const response = await send({
    method: "GET",
    path: "/",
    token: telemetryToken,
  });
  expect(response.status).toBe(403);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );
});

it.skipIf(!enabled)("applies a capability revocation immediately", async () => {
  const target = await fixture.createOperator([]);
  const grant = await send({
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: managerToken,
    body: { grant: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code] },
  });
  expect(grant.status).toBe(200);
  expect(
    (await send({ method: "GET", path: "/", token: target.token })).status
  ).toBe(200);

  const revoke = await send({
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: managerToken,
    body: { revoke: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code] },
  });
  expect(revoke.status).toBe(200);
  const denied = await send({
    method: "GET",
    path: "/",
    token: target.token,
  });
  expect(denied.status).toBe(403);
  expect((await parseProblem(denied)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
      entityId: target.id,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.after).toMatchObject({ capabilities: [] });
  expect(audit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)("ends capabilities and sessions on revocation", async () => {
  const target = await fixture.createOperator([
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  ]);
  const revoked = await send({
    method: "PATCH",
    path: `/${target.id}`,
    token: managerToken,
    body: {
      status: "REVOKED",
      expectedStatus: "ACTIVE",
      reason: "Capability revocation review",
    },
  });
  expect(revoked.status).toBe(200);

  const session = await verifyControlSession({
    prisma: fixture.platformPrisma,
    secret: process.env.CONTROL_SESSION_SECRET ?? "",
    token: target.token,
  });
  expect(session.valid).toBe(false);
  const denied = await send({
    method: "GET",
    path: "/",
    token: target.token,
  });
  expect(denied.status).toBe(401);

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.STATUS_CHANGED,
      entityId: target.id,
    },
  });
  expect(audit?.after).toMatchObject({ status: "REVOKED" });
  expect(audit?.recordHash).toHaveLength(64);
});
