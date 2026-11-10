import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  STEP_UP_TOKEN_HEADER,
  problemDetailsSchema,
} from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_AUDIT_PENDING_HASH,
  issueControlSession,
  verifyControlSession,
} from "@suite/auth/platform";
import { platformTestRpId } from "../../helpers/platform-rp.js";
import { IDEMPOTENCY_HEADER } from "@suite/redis";
import { platformOperatorPasskeysRouter } from "../../../src/routes/admin/operator-passkeys.js";
import {
  OPERATOR_READ_RATE_LIMIT_KEY,
  OPERATOR_RATE_LIMIT_KEY,
  platformOperatorsRouter,
} from "../../../src/routes/admin/operators.js";
import { envelope } from "../../../src/routes/admin/openapi-shared.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import {
  capabilitySetSchema,
  createdOperatorSchema,
  enrolmentOptionsSchema,
  operatorPageSchema,
  operatorSchema,
  operatorSessionPageSchema,
} from "../../../src/services/admin/operator.contract.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  disconnectPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";
import { issueStepUpTokenForSessionToken } from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);
const EMAIL_PREFIX = "operator-governance";
const suffix = Date.now().toString(36);
const createdIds: string[] = [];
const operatorPageEnvelope = envelope(operatorPageSchema);
const createdOperatorEnvelope = envelope(createdOperatorSchema);
const operatorEnvelope = envelope(operatorSchema);
const capabilitySetEnvelope = envelope(capabilitySetSchema);
const sessionPageEnvelope = envelope(operatorSessionPageSchema);
const enrolmentOptionsEnvelope = envelope(enrolmentOptionsSchema);
const CONTROL_PLANE_ORIGIN = process.env.CONTROL_PLANE_ORIGIN ?? "";
let platformPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let ownerId: string;
let ownerToken: string;
let limitedToken: string;
let keyCounter = 0;

async function reissueSession(operatorId: string): Promise<string> {
  const issued = await issueControlSession({
    prisma: platformPrisma,
    secret: process.env.CONTROL_SESSION_SECRET ?? "",
    operatorId,
    rpID: platformTestRpId(),
  });
  return issued.token;
}

async function createActiveOperator(
  capabilities: readonly string[]
): Promise<{ id: string; token: string }> {
  const email = `${EMAIL_PREFIX}-${suffix}-${createdIds.length}@example.com`;
  const operator = await platformPrisma.platformOperator.create({
    data: {
      email,
      displayName: "Governance Operator",
      status: "ACTIVE",
      mfaEnrolled: true,
    },
  });
  createdIds.push(operator.id);
  if (capabilities.length > 0) {
    await platformPrisma.operatorCapability.createMany({
      data: capabilities.map((capability) => ({
        operatorId: operator.id,
        capability,
      })),
    });
  }
  const issued = await issueControlSession({
    prisma: platformPrisma,
    secret: secret ?? "",
    operatorId: operator.id,
    rpID: platformTestRpId(),
  });
  return { id: operator.id, token: issued.token };
}

async function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly forwardedFor?: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: CONTROL_PLANE_ORIGIN,
    "X-Forwarded-For": input.forwardedFor ?? "198.51.100.20",
  };
  if (input.token !== undefined) {
    headers.Cookie = `${CONTROL_SESSION_COOKIE_NAME}=${input.token}`;
  }
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (input.idempotencyKey !== undefined) {
    headers[IDEMPOTENCY_HEADER] = input.idempotencyKey;
  }
  if (input.method !== "GET" && input.token !== undefined) {
    const stepUpToken = await issueStepUpTokenForSessionToken(input.token);
    if (stepUpToken !== null) {
      headers[STEP_UP_TOKEN_HEADER] = stepUpToken;
    }
  }
  return platformOperatorsRouter.request(input.path, {
    method: input.method,
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
}

async function problem(response: Response) {
  expect(response.headers.get("content-type")).toContain(
    "application/problem+json"
  );
  return problemDetailsSchema.parse(await response.json());
}

function sendEnrolment(path: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    platformOperatorPasskeysRouter.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: CONTROL_PLANE_ORIGIN,
        "X-Forwarded-For": "198.51.100.21",
      },
      body: JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorsRouter.onError(globalErrorHandler);
  platformOperatorPasskeysRouter.onError(globalErrorHandler);
  platformPrisma = createPlatformTestClient();
  ownerPrisma = createPlatformOwnerTestClient();
  await clearRateLimitStore("rl:admin:operators");
  const owner = await createActiveOperator([
    PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
  ]);
  ownerId = owner.id;
  ownerToken = owner.token;
  limitedToken = (await createActiveOperator([])).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore("rl:admin:operators");
  await clearRateLimitStore("rl:admin:operator-passkeys");
});

afterAll(async () => {
  if (!enabled) return;
  const created = await ownerPrisma.platformOperator.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const ids = [...new Set([...createdIds, ...created.map((row) => row.id)])];
  await ownerPrisma.auditEvent.deleteMany({
    where: {
      OR: [{ entityId: { in: ids } }, { actorOperatorId: { in: ids } }],
    },
  });
  await ownerPrisma.operatorSession.deleteMany({
    where: { operatorId: { in: ids } },
  });
  await ownerPrisma.operatorCapability.deleteMany({
    where: { operatorId: { in: ids } },
  });
  await ownerPrisma.operatorInvitation.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
  await ownerPrisma.platformOperator.deleteMany({ where: { id: { in: ids } } });
  await disconnectPlatformTestClient(platformPrisma);
  await disconnectPlatformTestClient(ownerPrisma);
});

it.skipIf(!enabled)("lists operators without exposing invitation secrets", async () => {
  const seen = new Set<string>();
  let cursor: string | null = null;

  do {
    const path =
      cursor === null
        ? "/?limit=100"
        : `/?limit=100&cursor=${encodeURIComponent(cursor)}`;
    const allowed = await send({ method: "GET", path, token: ownerToken });
    expect(allowed.status).toBe(200);
    const page = operatorPageEnvelope.parse(await allowed.json());
    for (const item of page.data.items) {
      seen.add(item.id);
    }
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain("invitationToken");
    expect(serialized).not.toContain("tokenHash");
    cursor = page.data.nextCursor;
  } while (cursor !== null);

  expect(seen.has(ownerId)).toBe(true);
});

it.skipIf(!enabled)("denies listing and inviting without the capability", async () => {
  const denied = await send({ method: "GET", path: "/", token: limitedToken });
  expect(denied.status).toBe(403);
  expect((await problem(denied)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );

  const anonymous = await send({ method: "GET", path: "/" });
  expect(anonymous.status).toBe(401);

  const deniedInvite = await send({
    method: "POST",
    path: "/",
    token: limitedToken,
    idempotencyKey: `operator-denied-${suffix}-${++keyCounter}`,
    body: {
      email: `${EMAIL_PREFIX}-denied-${suffix}@example.com`,
      displayName: "Denied",
      capabilities: [],
    },
  });
  expect(deniedInvite.status).toBe(403);
});

it.skipIf(!enabled)("paginates operators with a stable cursor", async () => {
  const first = await send({
    method: "GET",
    path: "/?limit=1",
    token: ownerToken,
  });
  expect(first.status).toBe(200);
  const firstPage = operatorPageEnvelope.parse(await first.json());
  expect(firstPage.data.items).toHaveLength(1);
  expect(firstPage.data.nextCursor).toBeTruthy();

  const second = await send({
    method: "GET",
    path: `/?limit=1&cursor=${encodeURIComponent(firstPage.data.nextCursor ?? "")}`,
    token: ownerToken,
  });
  expect(second.status).toBe(200);
  const secondPage = operatorPageEnvelope.parse(await second.json());
  expect(secondPage.data.items[0]?.id).not.toBe(firstPage.data.items[0]?.id);
});

it.skipIf(!enabled)("gives reads a larger budget than mutations", async () => {
  const forwardedFor = "198.51.100.99";
  await clearRateLimitStore(OPERATOR_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(OPERATOR_RATE_LIMIT_KEY);
  const responses = await Promise.all(
    Array.from({ length: 21 }, () =>
      send({
        method: "GET",
        path: "/",
        token: ownerToken,
        forwardedFor,
      }),
    ),
  );
  for (const response of responses) {
    expect(response.status).toBe(200);
  }
});

it.skipIf(!enabled)("requires an idempotency key for an invitation", async () => {
  const response = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    body: {
      email: `${EMAIL_PREFIX}-no-key-${suffix}@example.com`,
      displayName: "No Key",
      capabilities: [],
    },
  });
  expect(response.status).toBe(422);
  expect((await problem(response)).code).toBe(
    PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED
  );
});

it.skipIf(!enabled)("invites an operator and audits the mutation", async () => {
  const email = `${EMAIL_PREFIX}-invited-${suffix}@example.com`;
  const response = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-invite-${suffix}-${++keyCounter}`,
    body: {
      email,
      displayName: "Invited Operator",
      capabilities: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code],
    },
  });
  expect(response.status).toBe(201);
  const body = createdOperatorEnvelope.parse(await response.json());
  const operator = body.data.operator;
  const token = body.data.invitationToken;
  expect(operator.status).toBe("INVITED");
  expect(body.data.admissionPending).toBe(true);
  expect(token).toBeTruthy();

  const invitation = await ownerPrisma.operatorInvitation.findFirst({
    where: { email },
  });
  expect(invitation?.tokenHash).toHaveLength(64);
  expect(invitation?.tokenHash).not.toBe(token);
  expect(invitation?.acceptedAt).toBeNull();
  const ttl = (invitation?.expiresAt.getTime() ?? 0) - Date.now();
  expect(ttl).toBeGreaterThan(23.9 * 3_600_000);
  expect(ttl).toBeLessThan(24.1 * 3_600_000);

  const audit = await ownerPrisma.auditEvent.findFirst({
    where: { action: PLATFORM_AUDIT_ACTIONS.INVITED, entityId: operator.id },
  });
  expect(audit?.recordHash).toHaveLength(64);
  expect(audit?.recordHash).not.toBe(PLATFORM_AUDIT_PENDING_HASH);
});

it.skipIf(!enabled)("rejects an unknown capability and a duplicate invitation", async () => {
  const unknown = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-unknown-${suffix}-${++keyCounter}`,
    body: {
      email: `${EMAIL_PREFIX}-unknown-${suffix}@example.com`,
      displayName: "Unknown Capability",
      capabilities: ["platform:not-a-capability"],
    },
  });
  expect(unknown.status).toBe(422);
  expect((await problem(unknown)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_CAPABILITY
  );

  const email = `${EMAIL_PREFIX}-duplicate-${suffix}@example.com`;
  const first = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-duplicate-a-${suffix}-${++keyCounter}`,
    body: { email, displayName: "Duplicate", capabilities: [] },
  });
  expect(first.status).toBe(201);
  const second = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-duplicate-b-${suffix}-${++keyCounter}`,
    body: { email, displayName: "Duplicate", capabilities: [] },
  });
  expect(second.status).toBe(409);
  expect((await problem(second)).code).toBe(
    PLATFORM_ERROR_CODE.OPERATOR_ALREADY_INVITED
  );

  const owner = await ownerPrisma.platformOperator.findUnique({
    where: { id: ownerId },
    select: { email: true },
  });
  const activeDuplicate = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-duplicate-active-${suffix}-${++keyCounter}`,
    body: {
      email: owner?.email ?? "",
      displayName: "Active Duplicate",
      capabilities: [],
    },
  });
  expect(activeDuplicate.status).toBe(409);
  expect((await problem(activeDuplicate)).code).toBe(
    PLATFORM_ERROR_CODE.OPERATOR_ALREADY_EXISTS
  );
});

it.skipIf(!enabled)("suspends an operator, revokes sessions and records the reason", async () => {
  const target = await createActiveOperator([]);
  const response = await send({
    method: "PATCH",
    path: `/${target.id}`,
    token: ownerToken,
    idempotencyKey: `operator-suspend-${suffix}-${++keyCounter}`,
    body: {
      status: "SUSPENDED",
      expectedStatus: "ACTIVE",
      reason: "Security review",
    },
  });
  expect(response.status).toBe(200);
  const body = operatorEnvelope.parse(await response.json());
  expect(body.data.status).toBe("SUSPENDED");

  const session = await verifyControlSession({
    prisma: platformPrisma,
    secret: secret ?? "",
    token: target.token,
    rpID: platformTestRpId(),
  });
  expect(session.valid).toBe(false);

  const audit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.STATUS_CHANGED,
      entityId: target.id,
    },
  });
  expect(audit?.reason).toBe("Security review");
});

it.skipIf(!enabled)("invalidates the capability cache after a grant and revoke", async () => {
  const target = await createActiveOperator([]);
  const deniedBefore = await send({
    method: "GET",
    path: "/",
    token: target.token,
  });
  expect(deniedBefore.status).toBe(403);

  const grant = await send({
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: ownerToken,
    idempotencyKey: `operator-grant-${suffix}-${++keyCounter}`,
    body: { grant: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code] },
  });
  expect(grant.status).toBe(200);
  const granted = capabilitySetEnvelope.parse(await grant.json());
  expect(granted.data.capabilities).toContain(
    PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code
  );
  const afterGrant = await reissueSession(target.id);
  const allowed = await send({
    method: "GET",
    path: "/",
    token: afterGrant,
  });
  expect(allowed.status).toBe(200);

  const revoke = await send({
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: ownerToken,
    idempotencyKey: `operator-revoke-${suffix}-${++keyCounter}`,
    body: { revoke: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code] },
  });
  expect(revoke.status).toBe(200);

  const stale = await send({
    method: "GET",
    path: "/",
    token: afterGrant,
  });
  expect(stale.status).toBe(401);

  const afterRevoke = await reissueSession(target.id);
  const deniedAfter = await send({
    method: "GET",
    path: "/",
    token: afterRevoke,
  });
  expect(deniedAfter.status).toBe(403);

  const audit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.CAPABILITIES_CHANGED,
      entityId: target.id,
    },
  });
  expect(audit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)("lists and revokes one operator session", async () => {
  const target = await createActiveOperator([]);
  const list = await send({
    method: "GET",
    path: `/${target.id}/sessions`,
    token: ownerToken,
  });
  expect(list.status).toBe(200);
  const sessions = sessionPageEnvelope.parse(await list.json());
  const sessionId = sessions.data.items[0]?.id;
  expect(sessionId).toBeDefined();

  const revoke = await send({
    method: "DELETE",
    path: `/${target.id}/sessions/${sessionId ?? ""}`,
    token: ownerToken,
    idempotencyKey: `operator-session-revoke-${suffix}-${++keyCounter}`,
  });
  expect(revoke.status).toBe(204);

  const verified = await verifyControlSession({
    prisma: platformPrisma,
    secret: secret ?? "",
    token: target.token,
    rpID: platformTestRpId(),
  });
  expect(verified.valid).toBe(false);

  const audit = await ownerPrisma.auditEvent.findFirst({
    where: { action: PLATFORM_AUDIT_ACTIONS.SESSION_REVOKED },
  });
  expect(audit?.entityId).toBe(sessionId);

  const missing = await send({
    method: "GET",
    path: "/operator_missing_probe/sessions",
    token: ownerToken,
  });
  expect(missing.status).toBe(404);
  expect((await problem(missing)).code).toBe(
    PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND
  );
});

it.skipIf(!enabled)("starts enrolment from a valid invitation and rejects expired tokens", async () => {
  const email = `${EMAIL_PREFIX}-enrol-${suffix}@example.com`;
  const invite = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-enrol-invite-${suffix}-${++keyCounter}`,
    body: { email, displayName: "Enrol", capabilities: [] },
  });
  expect(invite.status).toBe(201);
  const invited = createdOperatorEnvelope.parse(await invite.json());
  const invitationToken = invited.data.invitationToken ?? "";

  const options = await sendEnrolment("/enrolment/options", {
    token: invitationToken,
  });
  expect(options.status).toBe(200);
  const registration = enrolmentOptionsEnvelope.parse(await options.json());
  expect(registration.data.email).toBe(email);
  expect(registration.data.flowId).toBeTruthy();

  const invalid = await sendEnrolment("/enrolment/options", {
    token: "x".repeat(43),
  });
  expect(invalid.status).toBe(401);

  await ownerPrisma.operatorInvitation.updateMany({
    where: { email },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  const expired = await sendEnrolment("/enrolment/options", {
    token: invitationToken,
  });
  expect(expired.status).toBe(401);

  const verify = await sendEnrolment("/enrolment/verify", {
    token: "y".repeat(43),
    flowId: "missing-flow",
    response: {
      id: "credential",
      rawId: "eA",
      type: "public-key",
      response: { clientDataJSON: "eA", attestationObject: "eA" },
      clientExtensionResults: {},
    },
  });
  expect(verify.status).toBe(401);
});

it.skipIf(!enabled)("reissues an expired invitation instead of burning the email", async () => {
  const email = `${EMAIL_PREFIX}-reissue-${suffix}@example.com`;
  const first = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-reissue-a-${suffix}-${++keyCounter}`,
    body: { email, displayName: "Reissue", capabilities: [] },
  });
  expect(first.status).toBe(201);
  const firstBody = createdOperatorEnvelope.parse(await first.json());

  await ownerPrisma.operatorInvitation.updateMany({
    where: { email },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  const second = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-reissue-b-${suffix}-${++keyCounter}`,
    body: { email, displayName: "Reissue", capabilities: [] },
  });
  expect(second.status).toBe(201);
  const secondBody = createdOperatorEnvelope.parse(await second.json());
  expect(secondBody.data.invitationToken).not.toBe(
    firstBody.data.invitationToken
  );

  const invitations = await ownerPrisma.operatorInvitation.findMany({
    where: { email },
    orderBy: { id: "asc" },
  });
  expect(invitations).toHaveLength(2);
  expect(invitations[0]?.revokedAt).not.toBeNull();
  expect(invitations[1]?.revokedAt).toBeNull();
});

it.skipIf(!enabled)("enforces operator status transitions", async () => {
  const target = await createActiveOperator([]);
  const suspended = await send({
    method: "PATCH",
    path: `/${target.id}`,
    token: ownerToken,
    idempotencyKey: `operator-transition-suspend-${suffix}-${++keyCounter}`,
    body: {
      status: "SUSPENDED",
      expectedStatus: "ACTIVE",
      reason: "Maintenance window",
    },
  });
  expect(suspended.status).toBe(200);
  const restored = await send({
    method: "PATCH",
    path: `/${target.id}`,
    token: ownerToken,
    idempotencyKey: `operator-transition-restore-${suffix}-${++keyCounter}`,
    body: {
      status: "ACTIVE",
      expectedStatus: "SUSPENDED",
      reason: "Maintenance complete",
    },
  });
  expect(restored.status).toBe(200);
  expect(operatorEnvelope.parse(await restored.json()).data.status).toBe(
    "ACTIVE"
  );

  const stale = await send({
    method: "PATCH",
    path: `/${target.id}`,
    token: ownerToken,
    idempotencyKey: `operator-transition-stale-${suffix}-${++keyCounter}`,
    body: {
      status: "REVOKED",
      expectedStatus: "SUSPENDED",
      reason: "Stale view",
    },
  });
  expect(stale.status).toBe(409);
  expect((await problem(stale)).code).toBe(
    PLATFORM_ERROR_CODE.VERSION_CONFLICT
  );
});

it.skipIf(!enabled)("revokes an invited operator and its pending invitation", async () => {
  const email = `${EMAIL_PREFIX}-transition-${suffix}@example.com`;
  const invite = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: `operator-transition-invite-${suffix}-${++keyCounter}`,
    body: { email, displayName: "Transition", capabilities: [] },
  });
  const invited = createdOperatorEnvelope.parse(await invite.json());
  const invalid = await send({
    method: "PATCH",
    path: `/${invited.data.operator.id}`,
    token: ownerToken,
    idempotencyKey: `operator-transition-invalid-${suffix}-${++keyCounter}`,
    body: {
      status: "ACTIVE",
      expectedStatus: "INVITED",
      reason: "Skip enrolment",
    },
  });
  expect(invalid.status).toBe(422);
  expect((await problem(invalid)).code).toBe(
    PLATFORM_ERROR_CODE.INVALID_TRANSITION
  );

  const revoked = await send({
    method: "PATCH",
    path: `/${invited.data.operator.id}`,
    token: ownerToken,
    idempotencyKey: `operator-transition-revoke-${suffix}-${++keyCounter}`,
    body: {
      status: "REVOKED",
      expectedStatus: "INVITED",
      reason: "Invitation cancelled",
    },
  });
  expect(revoked.status).toBe(200);
  const pendingInvitation = await ownerPrisma.operatorInvitation.findFirst({
    where: { email },
  });
  expect(pendingInvitation?.revokedAt).not.toBeNull();
});

it.skipIf(!enabled)("rejects invalid capability changes", async () => {
  const target = await createActiveOperator([]);
  const base = {
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: ownerToken,
  };
  const unknown = await send({
    ...base,
    idempotencyKey: `operator-cap-unknown-${suffix}-${++keyCounter}`,
    body: { grant: ["platform:not-a-capability"] },
  });
  expect(unknown.status).toBe(422);
  expect((await problem(unknown)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_CAPABILITY
  );

  const empty = await send({
    ...base,
    idempotencyKey: `operator-cap-empty-${suffix}-${++keyCounter}`,
    body: { grant: [], revoke: [] },
  });
  expect(empty.status).toBe(422);
  expect((await problem(empty)).code).toBe(
    PLATFORM_ERROR_CODE.VALIDATION_FAILED
  );

  const overlap = await send({
    ...base,
    idempotencyKey: `operator-cap-overlap-${suffix}-${++keyCounter}`,
    body: {
      grant: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code],
      revoke: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code],
    },
  });
  expect(overlap.status).toBe(422);
  expect((await problem(overlap)).code).toBe(
    PLATFORM_ERROR_CODE.VALIDATION_FAILED
  );

  const missing = await send({
    method: "PATCH",
    path: "/operator_missing_probe/capabilities",
    token: ownerToken,
    idempotencyKey: `operator-cap-missing-${suffix}-${++keyCounter}`,
    body: { grant: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code] },
  });
  expect(missing.status).toBe(404);
  expect((await problem(missing)).code).toBe(
    PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND
  );
});

it.skipIf(!enabled)("blocks the last operator manager from demoting itself", async () => {
  const target = await createActiveOperator([
    PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
  ]);
  const otherManagers = await ownerPrisma.operatorCapability.findMany({
    where: {
      capability: PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
      revokedAt: null,
      operatorId: { not: target.id },
    },
    select: { id: true },
  });
  const otherIds = otherManagers.map((row) => row.id);
  await ownerPrisma.operatorCapability.updateMany({
    where: { id: { in: otherIds } },
    data: { revokedAt: new Date() },
  });
  try {
    const revokeSelf = await send({
      method: "PATCH",
      path: `/${target.id}/capabilities`,
      token: target.token,
      idempotencyKey: `operator-last-cap-${suffix}-${++keyCounter}`,
      body: { revoke: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code] },
    });
    expect(revokeSelf.status).toBe(409);
    expect((await problem(revokeSelf)).code).toBe(
      PLATFORM_ERROR_CODE.LAST_OPERATOR_GUARD
    );

    const revokeStatus = await send({
      method: "PATCH",
      path: `/${target.id}`,
      token: target.token,
      idempotencyKey: `operator-last-status-${suffix}-${++keyCounter}`,
      body: {
        status: "REVOKED",
        expectedStatus: "ACTIVE",
        reason: "Self revocation attempt",
      },
    });
    expect(revokeStatus.status).toBe(409);
    expect((await problem(revokeStatus)).code).toBe(
      PLATFORM_ERROR_CODE.LAST_OPERATOR_GUARD
    );
  } finally {
    await ownerPrisma.operatorCapability.updateMany({
      where: { id: { in: otherIds } },
      data: { revokedAt: null },
    });
  }
});

it.skipIf(!enabled)("replays the invitation without the once-only token", async () => {
  const email = `${EMAIL_PREFIX}-replay-${suffix}@example.com`;
  const key = `operator-replay-${suffix}-${++keyCounter}`;
  const body = { email, displayName: "Replay", capabilities: [] };
  const first = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: key,
    body,
  });
  expect(first.status).toBe(201);
  const firstBody = createdOperatorEnvelope.parse(await first.json());
  expect(firstBody.data.invitationToken).toBeTruthy();

  const second = await send({
    method: "POST",
    path: "/",
    token: ownerToken,
    idempotencyKey: key,
    body,
  });
  expect(second.headers.get("x-idempotent-replay")).toBe("true");
  const secondBody = createdOperatorEnvelope.parse(await second.json());
  expect(secondBody.data.operator.id).toBe(firstBody.data.operator.id);
  expect(secondBody.data.invitationToken).toBeNull();
});
