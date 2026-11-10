import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_STEP_UP_FAILURE_REASONS,
  issueStepUpToken,
  verifyAndConsumeStepUpToken,
} from "@suite/auth/platform";
import { redis } from "@suite/redis";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { platformAuthRouter } from "../../../src/routes/admin/auth.js";
import { tenantLifecycleRouter } from "../../../src/routes/admin/lifecycle.js";
import { platformOperatorsRouter } from "../../../src/routes/admin/operators.js";
import { platformImpersonationRouter } from "../../../src/routes/admin/impersonation.js";
import { platformCatalogsRouter } from "../../../src/routes/admin/catalogs.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const webAuthn = vi.hoisted(() => ({
  verify: vi.fn(() => Promise.resolve(7)),
}));

vi.mock(
  "../../../src/services/admin/platform-webauthn.service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../src/services/admin/platform-webauthn.service.js")
      >();
    return { ...actual, finishAuthentication: webAuthn.verify };
  }
);

const enabled = platformOperatorTestsEnabled();
const EMAIL_PREFIX = "step-up";
const STEP_UP_PATH = "/step-up/verify";
const STEP_UP_TEST_KEY = "rl:platform:auth:step-up";
const CREDENTIAL_PREFIX = "step-up-credential";
const CATALOG_CODE_PREFIX = "zz_step_up_";
const REASON = "Confirming identity before a destructive platform change.";
const TICKET_REF = "SUP-308";

const authenticationResponse = {
  id: "credential",
  rawId: "eA",
  type: "public-key" as const,
  response: {
    clientDataJSON: "eA",
    authenticatorData: "eA",
    signature: "eA",
  },
  clientExtensionResults: {},
};

let fixture: OperatorFixture;
let operator: { readonly id: string; readonly token: string };
let otherOperator: { readonly id: string; readonly token: string };
let organizationId: string;
let keyCounter = 0;

function controlPlaneOrigin(): string {
  const origin = process.env.CONTROL_PLANE_ORIGIN;
  if (origin === undefined || origin.trim() === "") {
    throw new Error("CONTROL_PLANE_ORIGIN must be set for step-up tests");
  }
  return origin;
}

function secret(): string {
  return process.env.CONTROL_SESSION_SECRET ?? "";
}

function nextKey(): string {
  keyCounter += 1;
  return `step-up-${Date.now().toString(36)}-${keyCounter}`;
}

function passkeyFor(
  operatorIdValue: string,
  suffix: string
): {
  operatorId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  rpId: string;
  name: string;
} {
  return {
    operatorId: operatorIdValue,
    credentialId: `${CREDENTIAL_PREFIX}-${suffix}`,
    publicKey: "placeholder-public-key",
    counter: 0,
    rpId: process.env.CONTROL_WEBAUTHN_RP_ID ?? "localhost",
    name: "Step-up passkey",
  };
}

function verifyRequest(input: {
  readonly cookie?: string;
  readonly credentialId: string;
  readonly origin?: string;
  readonly flowId?: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: input.origin ?? controlPlaneOrigin(),
    "X-Forwarded-For": "198.51.100.61",
  };
  if (input.cookie !== undefined) {
    headers.Cookie = `${CONTROL_SESSION_COOKIE_NAME}=${input.cookie}`;
  }
  return Promise.resolve(
    platformAuthRouter.request(STEP_UP_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify({
        flowId: input.flowId ?? "step-up-flow",
        response: { ...authenticationResponse, id: input.credentialId },
      }),
    })
  );
}

async function createOrganization(
  status: "ACTIVE" | "SUSPENDED" = "ACTIVE"
): Promise<string> {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Step-up ${suffix}`,
      slug: `step-up-${suffix}`,
      status,
    },
  });
  return organization.id;
}

async function createCatalogValue(): Promise<string> {
  const code = `${CATALOG_CODE_PREFIX}${Date.now().toString(36)}`;
  const response = await sendOperatorRequest(platformCatalogsRouter, {
    method: "POST",
    path: "/branch_type/values",
    token: operator.token,
    body: { code, label: "Step-up test value", sortOrder: 99 },
  });
  expect(response.status).toBe(200);
  return code;
}

async function countAudits(
  action: string,
  organization: string | null,
  entityId?: string
): Promise<number> {
  return fixture.ownerPrisma.auditEvent.count({
    where: {
      action,
      ...(organization === null ? {} : { organizationId: organization }),
      ...(entityId === undefined ? {} : { entityId }),
    },
  });
}

async function suspendRequest(stepUpToken: string | null): Promise<Response> {
  return sendOperatorRequest(tenantLifecycleRouter, {
    method: "POST",
    path: `/tenants/${organizationId}/suspend`,
    token: operator.token,
    stepUpToken,
    body: { reason: REASON, expectedStatus: "ACTIVE" },
    idempotencyKey: nextKey(),
  });
}

async function capabilityRequest(stepUpToken: string | null): Promise<Response> {
  return sendOperatorRequest(platformOperatorsRouter, {
    method: "PATCH",
    path: `/${otherOperator.id}/capabilities`,
    token: operator.token,
    stepUpToken,
    body: { grant: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code], revoke: [] },
    idempotencyKey: nextKey(),
  });
}

async function impersonationRequest(
  stepUpToken: string | null
): Promise<Response> {
  return sendOperatorRequest(platformImpersonationRouter, {
    method: "POST",
    path: "/impersonation",
    token: operator.token,
    stepUpToken,
    body: { organizationId, reason: REASON, ticketRef: TICKET_REF },
    idempotencyKey: nextKey(),
  });
}

async function expectRestoreRequiresStepUp(): Promise<void> {
  const organization = await createOrganization();
  const suspended = await sendOperatorRequest(tenantLifecycleRouter, {
    method: "POST",
    path: `/tenants/${organization}/suspend`,
    token: operator.token,
    body: { reason: REASON, expectedStatus: "ACTIVE" },
    idempotencyKey: nextKey(),
  });
  expect(suspended.status).toBe(200);
  const auditsBefore = await countAudits(
    PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
    organization
  );

  const restore = await sendOperatorRequest(tenantLifecycleRouter, {
    method: "POST",
    path: `/tenants/${organization}/restore`,
    token: operator.token,
    stepUpToken: null,
    body: { reason: REASON, expectedStatus: "SUSPENDED" },
    idempotencyKey: nextKey(),
  });
  expect(restore.status).toBe(403);
  expect((await parseProblem(restore)).code).toBe(
    PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
  );
  expect(
    await countAudits(PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED, organization)
  ).toBe(auditsBefore);
  const row = await fixture.ownerPrisma.organization.findUnique({
    where: { id: organization },
    select: { status: true },
  });
  expect(row?.status).toBe("SUSPENDED");

  await fixture.ownerPrisma.lifecycleEvent.deleteMany({
    where: { organizationId: organization },
  });
  await fixture.ownerPrisma.auditEvent.deleteMany({
    where: { organizationId: organization },
  });
  await fixture.ownerPrisma.outboxEvent.deleteMany({
    where: {
      eventType: { startsWith: "platform.tenant." },
      payload: { path: ["organizationId"], equals: organization },
    },
  });
  await fixture.ownerPrisma.organization.delete({ where: { id: organization } });
}

async function expectArchiveRequiresStepUp(): Promise<void> {
  const organization = await createOrganization();
  const record = await fixture.ownerPrisma.organization.findUnique({
    where: { id: organization },
    select: { slug: true },
  });
  const auditsBefore = await countAudits(
    PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
    organization
  );

  const archive = await sendOperatorRequest(tenantLifecycleRouter, {
    method: "POST",
    path: `/tenants/${organization}/archive`,
    token: operator.token,
    stepUpToken: null,
    body: {
      reason: REASON,
      expectedStatus: "ACTIVE",
      confirmSlug: record?.slug ?? "",
    },
    idempotencyKey: nextKey(),
  });
  expect(archive.status).toBe(403);
  expect((await parseProblem(archive)).code).toBe(
    PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
  );
  expect(
    await countAudits(PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED, organization)
  ).toBe(auditsBefore);

  await fixture.ownerPrisma.lifecycleEvent.deleteMany({
    where: { organizationId: organization },
  });
  await fixture.ownerPrisma.auditEvent.deleteMany({
    where: { organizationId: organization },
  });
  await fixture.ownerPrisma.organization.delete({ where: { id: organization } });
}

beforeAll(async () => {
  if (!enabled) return;
  platformAuthRouter.onError(globalErrorHandler);
  tenantLifecycleRouter.onError(globalErrorHandler);
  platformOperatorsRouter.onError(globalErrorHandler);
  platformImpersonationRouter.onError(globalErrorHandler);
  platformCatalogsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  operator = await fixture.createOperator([
    PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
    PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
    PLATFORM_CAPABILITIES.IMPERSONATE.code,
    PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code,
  ]);
  otherOperator = await fixture.createOperator([]);
  organizationId = await createOrganization();
  await fixture.platformPrisma.operatorPasskey.create({
    data: passkeyFor(operator.id, "primary"),
  });
  await fixture.platformPrisma.operatorPasskey.create({
    data: passkeyFor(otherOperator.id, "other"),
  });
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(STEP_UP_TEST_KEY);
  await fixture.ownerPrisma.impersonationSession.deleteMany({
    where: { organizationId },
  });
  await fixture.ownerPrisma.auditEvent.deleteMany({
    where: { organizationId },
  });
  await fixture.ownerPrisma.catalogValue.deleteMany({
    where: { code: { startsWith: CATALOG_CODE_PREFIX } },
  });
  await fixture.ownerPrisma.operatorCapability.updateMany({
    where: { operatorId: otherOperator.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await fixture.ownerPrisma.organization.update({
    where: { id: organizationId },
    data: { status: "ACTIVE" },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.ownerPrisma.impersonationSession.deleteMany({
    where: { organizationId },
  });
  await fixture.ownerPrisma.auditEvent.deleteMany({
    where: { organizationId },
  });
  await fixture.ownerPrisma.catalogValue.deleteMany({
    where: { code: { startsWith: CATALOG_CODE_PREFIX } },
  });
  await fixture.ownerPrisma.organization.deleteMany({
    where: { id: organizationId },
  });
  await fixture.cleanup();
});

it.skipIf(!enabled)(
  "issues a single-use token for a fresh assertion and audits it",
  async () => {
    webAuthn.verify.mockClear();
    const response = await verifyRequest({
      cookie: operator.token,
      credentialId: `${CREDENTIAL_PREFIX}-primary`,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { token: string; expiresAt: string };
    };
    expect(body.data.expiresAt).toMatch(/T/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const consumed = await verifyAndConsumeStepUpToken({
      token: body.data.token,
      operatorId: operator.id,
      secret: secret(),
      redis,
    });
    expect(consumed).toBe(true);
    const replay = await verifyAndConsumeStepUpToken({
      token: body.data.token,
      operatorId: operator.id,
      secret: secret(),
      redis,
    });
    expect(replay).toBe(false);

    const audit = await fixture.ownerPrisma.auditEvent.findFirst({
      where: {
        action: PLATFORM_AUDIT_ACTIONS.STEP_UP_VERIFIED,
        entityId: operator.id,
      },
    });
    expect(audit?.recordHash).toHaveLength(64);
  }
);

it.skipIf(!enabled)(
  "refuses an assertion for another operator and audits the refusal",
  async () => {
    const response = await verifyRequest({
      cookie: operator.token,
      credentialId: `${CREDENTIAL_PREFIX}-other`,
    });

    expect(response.status).toBe(401);
    expect((await parseProblem(response)).code).toBe("AUTH_UNAUTHORIZED");
    const audit = await fixture.ownerPrisma.auditEvent.findFirst({
      where: {
        action: PLATFORM_AUDIT_ACTIONS.STEP_UP_FAILED,
        actorOperatorId: operator.id,
        reason: PLATFORM_STEP_UP_FAILURE_REASONS.OPERATOR_MISMATCH,
      },
    });
    expect(audit).not.toBeNull();
  }
);

it.skipIf(!enabled)("refuses a failed assertion and writes no token", async () => {
  webAuthn.verify.mockRejectedValueOnce(new Error("assertion rejected"));
  const response = await verifyRequest({
    cookie: operator.token,
    credentialId: `${CREDENTIAL_PREFIX}-primary`,
  });

  expect(response.status).toBe(401);
  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.STEP_UP_FAILED,
      actorOperatorId: operator.id,
      reason: PLATFORM_STEP_UP_FAILURE_REASONS.VERIFICATION_FAILED,
    },
  });
  expect(audit).not.toBeNull();
});

it.skipIf(!enabled)("rejects a missing session and a foreign origin", async () => {
  const missing = await verifyRequest({
    credentialId: `${CREDENTIAL_PREFIX}-primary`,
  });
  expect(missing.status).toBe(401);

  const foreign = await verifyRequest({
    cookie: operator.token,
    credentialId: `${CREDENTIAL_PREFIX}-primary`,
    origin: "https://evil.example",
  });
  expect(foreign.status).toBe(403);
  expect((await parseProblem(foreign)).code).toBe(
    PLATFORM_ERROR_CODE.CORS_ORIGIN_DENIED
  );
});

it.skipIf(!enabled)("rate-limits verification attempts per client", async () => {
  const ip = `203.0.113.${Date.now() % 200}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    const response = await platformAuthRouter.request(STEP_UP_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: controlPlaneOrigin(),
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify({ flowId: "limit-flow", response: {} }),
    });
    lastStatus = response.status;
  }
  expect(lastStatus).toBe(429);
});

it.skipIf(!enabled)(
  "refuses suspend, capability and impersonation mutations without a token",
  async () => {
    const suspendBefore = await countAudits(
      PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
      organizationId
    );
    const capabilitiesBefore = await countAudits(
      PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
      null,
      otherOperator.id
    );
    const impersonationBefore = await countAudits(
      PLATFORM_AUDIT_ACTIONS.IMPERSONATION_STARTED,
      organizationId
    );

    const responses = await Promise.all([
      suspendRequest(null),
      capabilityRequest(null),
      impersonationRequest(null),
    ]);
    const problems = await Promise.all(
      responses.map((item) => parseProblem(item))
    );
    expect(responses.map((item) => item.status)).toEqual([403, 403, 403]);
    expect(problems.map((item) => item.code)).toEqual([
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED,
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED,
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED,
    ]);
    expect(
      await countAudits(
        PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
        organizationId
      )
    ).toBe(suspendBefore);
    expect(
      await countAudits(
        PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
        null,
        otherOperator.id
      )
    ).toBe(capabilitiesBefore);
    expect(
      await countAudits(
        PLATFORM_AUDIT_ACTIONS.IMPERSONATION_STARTED,
        organizationId
      )
    ).toBe(impersonationBefore);
    expect(
      await fixture.ownerPrisma.impersonationSession.count({
        where: { organizationId },
      })
    ).toBe(0);
  }
);

it.skipIf(!enabled)(
  "refuses lifecycle restore and archive without a token",
  async () => {
    await expectRestoreRequiresStepUp();
    await expectArchiveRequiresStepUp();
  }
);

it.skipIf(!enabled)(
  "refuses an expired token without mutating or auditing",
  async () => {
    const expired = await issueStepUpToken({
      operatorId: operator.id,
      secret: secret(),
      redis,
      now: new Date(Date.now() - 360_000),
    });
    const before = await countAudits(
      PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
      organizationId
    );

    const response = await suspendRequest(expired.token);
    expect(response.status).toBe(403);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
    );
    expect(
      await countAudits(
        PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
        organizationId
      )
    ).toBe(before);
    const tenant = await fixture.ownerPrisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    expect(tenant?.status).toBe("ACTIVE");
  }
);

it.skipIf(!enabled)(
  "refuses a token issued for another operator",
  async () => {
    const foreign = await issueStepUpToken({
      operatorId: otherOperator.id,
      secret: secret(),
      redis,
    });
    const before = await countAudits(
      PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
      null,
      otherOperator.id
    );

    const response = await capabilityRequest(foreign.token);
    expect(response.status).toBe(403);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
    );
    expect(
      await countAudits(
        PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
        null,
        otherOperator.id
      )
    ).toBe(before);
    expect(
      await fixture.ownerPrisma.operatorCapability.count({
        where: { operatorId: otherOperator.id, revokedAt: null },
      })
    ).toBe(0);
  }
);

it.skipIf(!enabled)("consumes a token once and refuses a replay", async () => {
  const issued = await issueStepUpToken({
    operatorId: operator.id,
    secret: secret(),
    redis,
  });

  const first = await impersonationRequest(issued.token);
  expect(first.status).toBe(201);
  const replay = await impersonationRequest(issued.token);
  expect(replay.status).toBe(403);
  expect((await parseProblem(replay)).code).toBe(
    PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
  );

  expect(
    await fixture.ownerPrisma.impersonationSession.count({
      where: { organizationId, operatorId: operator.id },
    })
  ).toBe(1);
  expect(
    await countAudits(
      PLATFORM_AUDIT_ACTIONS.IMPERSONATION_STARTED,
      organizationId
    )
  ).toBe(1);
});

it.skipIf(!enabled)(
  "requires a token only when a catalog value is retired",
  async () => {
    const code = await createCatalogValue();
    const value = await fixture.ownerPrisma.catalogValue.findUnique({
      where: { catalogKey_code: { catalogKey: "branch_type", code } },
      select: { version: true },
    });

    const relabel = await sendOperatorRequest(platformCatalogsRouter, {
      method: "PATCH",
      path: `/branch_type/values/${code}`,
      token: operator.token,
      stepUpToken: null,
      body: {
        label: "Relabelled without a ceremony",
        expectedVersion: value?.version,
      },
    });
    expect(relabel.status).toBe(200);

    const refreshed = await fixture.ownerPrisma.catalogValue.findUnique({
      where: { catalogKey_code: { catalogKey: "branch_type", code } },
      select: { version: true, isActive: true },
    });
    const retire = await sendOperatorRequest(platformCatalogsRouter, {
      method: "PATCH",
      path: `/branch_type/values/${code}`,
      token: operator.token,
      stepUpToken: null,
      body: { isActive: false, expectedVersion: refreshed?.version },
    });
    expect(retire.status).toBe(403);
    expect((await parseProblem(retire)).code).toBe(
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
    );
    const unchanged = await fixture.ownerPrisma.catalogValue.findUnique({
      where: { catalogKey_code: { catalogKey: "branch_type", code } },
      select: { isActive: true },
    });
    expect(unchanged?.isActive).toBe(true);
  }
);
