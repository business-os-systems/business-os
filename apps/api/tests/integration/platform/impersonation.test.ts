import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { Hono, type Context } from "hono";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  PERMISSIONS,
  TENANT_STATUS,
} from "@suite/core";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import { SESSION_COOKIE_NAME } from "@suite/auth";
import { createTestSessionToken } from "../../helpers/auth.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import {
  createImpersonationReadonlyGuard,
  SUPPORT_SESSION_HEADER,
} from "../../../src/middleware/impersonation-readonly.js";
import {
  IMPERSONATION_MUTATION_RATE_LIMIT_KEY,
  IMPERSONATION_READ_RATE_LIMIT_KEY,
  platformImpersonationRouter,
} from "../../../src/routes/admin/impersonation.js";
import { supportSessionsRouter } from "../../../src/routes/support-sessions.js";
import {
  tenantActorReference,
  type OperatorSupportSession,
} from "../../../src/services/admin/impersonation.service.js";
import { signImpersonationTicket } from "../../../src/services/admin/impersonation-ticket.js";
import { getControlSessionSecret } from "../../../src/lib/platform-env.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const EMAIL_PREFIX = "impersonation";
const IMPERSONATION_PATH = "/impersonation";
const REASON = "Investigating the billing discrepancy reported in SUP-237.";
const TICKET_REF = "SUP-237";
const TENANT_USER_ID = "usr_support_history_probe";
const PROBE_PATH = "/api/v1/probe";
const WRITE_METHODS = ["POST", "PATCH", "DELETE"] as const;

interface StartResult {
  readonly ticketId: string;
  readonly expiresAt: string;
  readonly tenantBannerToken: string;
}

interface ProbeApp {
  request(path: string, init?: RequestInit): Promise<Response>;
}

let fixture: OperatorFixture;
let operator: { readonly id: string; readonly token: string };
let organizationA: string;
let organizationB: string;
const organizationIds: string[] = [];

function sendPlatform(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformImpersonationRouter, input);
}

async function createOrganization(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Support ${label} ${fixture.suffix}`,
      slug: `support-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  return organization.id;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

async function startSession(organizationId: string): Promise<StartResult> {
  const response = await sendPlatform({
    method: "POST",
    path: IMPERSONATION_PATH,
    token: operator.token,
    body: { organizationId, reason: REASON, ticketRef: TICKET_REF },
  });
  expect(response.status).toBe(201);
  return readEnvelope<StartResult>(response);
}

function createProbeApp(): ProbeApp {
  const app = new Hono();
  const ok = (c: Context) => c.json({ ok: true });
  app.onError(globalErrorHandler);
  app.use(
    "/api/v1/*",
    createImpersonationReadonlyGuard({ headerName: SUPPORT_SESSION_HEADER })
  );
  app.get(PROBE_PATH, ok);
  app.post(PROBE_PATH, ok);
  app.patch(PROBE_PATH, ok);
  app.delete(PROBE_PATH, ok);
  return { request: (path, init) => Promise.resolve(app.request(path, init)) };
}

async function expectReadOnlyRefusal(
  app: ProbeApp,
  ticket: string
): Promise<void> {
  const headers = { [SUPPORT_SESSION_HEADER]: ticket };
  const read = await app.request(PROBE_PATH, { headers });
  expect(read.status).toBe(200);

  const writes = await Promise.all(
    WRITE_METHODS.map((method) => app.request(PROBE_PATH, { method, headers }))
  );
  const problems = await Promise.all(writes.map((item) => parseProblem(item)));
  expect(writes.map((item) => item.status)).toEqual([403, 403, 403]);
  expect(problems.map((item) => item.code)).toEqual([
    PLATFORM_ERROR_CODE.SUPPORT_SESSION_READ_ONLY,
    PLATFORM_ERROR_CODE.SUPPORT_SESSION_READ_ONLY,
    PLATFORM_ERROR_CODE.SUPPORT_SESSION_READ_ONLY,
  ]);
}

async function expectSessionEnded(ticket: string): Promise<void> {
  const response = await createProbeApp().request(PROBE_PATH, {
    headers: { [SUPPORT_SESSION_HEADER]: ticket },
  });
  expect(response.status).toBe(401);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.SUPPORT_SESSION_ENDED
  );
}

function sendTenant(
  path: string,
  method: string,
  token: string
): Promise<Response> {
  return Promise.resolve(
    supportSessionsRouter.request(path, {
      method,
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    })
  );
}

async function findAudit(
  ticketId: string,
  action: string
): Promise<{ actorOperatorId: string | null } | null> {
  return fixture.ownerPrisma.auditEvent.findFirst({
    where: { entityId: ticketId, action },
    orderBy: { occurredAt: "desc" },
    select: { actorOperatorId: true },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  platformImpersonationRouter.onError(globalErrorHandler);
  supportSessionsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  operator = await fixture.createOperator([PLATFORM_CAPABILITIES.IMPERSONATE.code]);
  organizationA = await createOrganization("alpha");
  organizationB = await createOrganization("beta");
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(IMPERSONATION_MUTATION_RATE_LIMIT_KEY);
  await clearRateLimitStore(IMPERSONATION_READ_RATE_LIMIT_KEY);
  await fixture.ownerPrisma.impersonationSession.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await fixture.ownerPrisma.auditEvent.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.ownerPrisma.impersonationSession.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  // A tenant-ended session has no operator actor, so the fixture cleanup cannot
  // find its audit row; remove it by organization before deleting the tenant.
  await fixture.ownerPrisma.auditEvent.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await fixture.ownerPrisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await fixture.cleanup();
});

it.skipIf(!enabled)(
  "starts a session, writes the row and audits IMPERSONATION_STARTED",
  async () => {
    const started = await startSession(organizationA);

    const row = await fixture.ownerPrisma.impersonationSession.findUnique({
      where: { ticketId: started.ticketId },
    });
    expect(row?.operatorId).toBe(operator.id);
    expect(row?.organizationId).toBe(organizationA);
    expect(row?.endedAt).toBeNull();
    expect(row?.ticketRef).toBe(TICKET_REF);

    const audit = await findAudit(
      started.ticketId,
      PLATFORM_AUDIT_ACTIONS.IMPERSONATION_STARTED
    );
    expect(audit?.actorOperatorId).toBe(operator.id);
  }
);

it.skipIf(!enabled)(
  "denies starting a session without the impersonate capability",
  async () => {
    const limited = await fixture.createOperator([
      PLATFORM_CAPABILITIES.TENANTS_READ.code,
    ]);

    const response = await sendPlatform({
      method: "POST",
      path: IMPERSONATION_PATH,
      token: limited.token,
      body: {
        organizationId: organizationA,
        reason: REASON,
        ticketRef: TICKET_REF,
      },
    });

    expect(response.status).toBe(403);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.CAPABILITY_DENIED
    );
  }
);

it.skipIf(!enabled)("caps the session lifetime at thirty minutes", async () => {
  const started = await startSession(organizationA);
  const minutes = (new Date(started.expiresAt).getTime() - Date.now()) / 60_000;

  expect(minutes).toBeGreaterThan(0);
  expect(minutes).toBeLessThanOrEqual(30);
});

it.skipIf(!enabled)(
  "refuses a second concurrent session for the same operator",
  async () => {
    await startSession(organizationA);

    const response = await sendPlatform({
      method: "POST",
      path: IMPERSONATION_PATH,
      token: operator.token,
      body: {
        organizationId: organizationB,
        reason: REASON,
        ticketRef: TICKET_REF,
      },
    });

    expect(response.status).toBe(409);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.IMPERSONATION_ALREADY_ACTIVE
    );
    const active = await fixture.ownerPrisma.impersonationSession.count({
      where: { operatorId: operator.id, endedAt: null },
    });
    expect(active).toBe(1);
  }
);

it.skipIf(!enabled)(
  "allows reads and refuses writes for a valid ticket (SC-017)",
  async () => {
    const started = await startSession(organizationA);
    await expectReadOnlyRefusal(createProbeApp(), started.tenantBannerToken);
  }
);

it.skipIf(!enabled)("rejects an ended ticket with SUPPORT_SESSION_ENDED", async () => {
  const started = await startSession(organizationA);
  await fixture.ownerPrisma.impersonationSession.update({
    where: { ticketId: started.ticketId },
    data: { endedAt: new Date(), endedBy: operator.id },
  });

  await expectSessionEnded(started.tenantBannerToken);
});

it.skipIf(!enabled)("rejects an expired ticket with SUPPORT_SESSION_ENDED", async () => {
  const started = await startSession(organizationA);
  await fixture.ownerPrisma.impersonationSession.update({
    where: { ticketId: started.ticketId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  await expectSessionEnded(started.tenantBannerToken);
});

it.skipIf(!enabled)(
  "lets the operator end the session and audits IMPERSONATION_ENDED",
  async () => {
    const started = await startSession(organizationA);

    const response = await sendPlatform({
      method: "DELETE",
      path: `/impersonation/${started.ticketId}`,
      token: operator.token,
    });

    expect(response.status).toBe(200);
    const ended = await readEnvelope<{ endedBy: string }>(response);
    expect(ended.endedBy).toBe(operator.id);

    const row = await fixture.ownerPrisma.impersonationSession.findUnique({
      where: { ticketId: started.ticketId },
      select: { endedAt: true, endedBy: true },
    });
    expect(row?.endedAt).not.toBeNull();
    expect(row?.endedBy).toBe(operator.id);

    const audit = await findAudit(
      started.ticketId,
      PLATFORM_AUDIT_ACTIONS.IMPERSONATION_ENDED
    );
    expect(audit?.actorOperatorId).toBe(operator.id);
  }
);

it.skipIf(!enabled)(
  "refuses to end an already ended session",
  async () => {
    const started = await startSession(organizationA);
    const path = `${IMPERSONATION_PATH}/${started.ticketId}`;
    const first = await sendPlatform({
      method: "DELETE",
      path,
      token: operator.token,
    });
    expect(first.status).toBe(200);

    const second = await sendPlatform({
      method: "DELETE",
      path,
      token: operator.token,
    });

    expect(second.status).toBe(409);
    expect((await parseProblem(second)).code).toBe(
      PLATFORM_ERROR_CODE.SUPPORT_SESSION_ALREADY_ENDED
    );
  }
);

it.skipIf(!enabled)(
  "lets a tenant administrator end the session with endedBy tenant:<userId>",
  async () => {
    const started = await startSession(organizationA);
    const tenantToken = await createTestSessionToken({
      userId: TENANT_USER_ID,
      organizationId: organizationA,
      permissions: [PERMISSIONS.CORE.ORGANIZATION_UPDATE],
    });

    const response = await sendTenant(
      `/${started.ticketId}`,
      "DELETE",
      tenantToken
    );

    expect(response.status).toBe(200);
    const ended = await readEnvelope<{ endedBy: string }>(response);
    expect(ended.endedBy).toBe(tenantActorReference(TENANT_USER_ID));

    const row = await fixture.ownerPrisma.impersonationSession.findUnique({
      where: { ticketId: started.ticketId },
      select: { endedBy: true },
    });
    expect(row?.endedBy).toBe(tenantActorReference(TENANT_USER_ID));

    const audit = await findAudit(
      started.ticketId,
      PLATFORM_AUDIT_ACTIONS.IMPERSONATION_ENDED
    );
    expect(audit?.actorOperatorId).toBeNull();
  }
);

it.skipIf(!enabled)(
  "denies tenant termination without the organization update permission",
  async () => {
    const started = await startSession(organizationA);
    const token = await createTestSessionToken({
      userId: TENANT_USER_ID,
      organizationId: organizationA,
      permissions: [],
    });

    const response = await sendTenant(
      `/${started.ticketId}`,
      "DELETE",
      token
    );

    expect(response.status).toBe(403);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.CAPABILITY_DENIED
    );
    const row = await fixture.ownerPrisma.impersonationSession.findUnique({
      where: { ticketId: started.ticketId },
      select: { endedAt: true },
    });
    expect(row?.endedAt).toBeNull();
  }
);

it.skipIf(!enabled)(
  "scopes tenant history to the session's organization",
  async () => {
    const started = await startSession(organizationA);
    const first = await sendTenant("/history", "GET", await createTenantToken(organizationA));
    const second = await sendTenant("/history", "GET", await createTenantToken(organizationB));

    expect(first.status).toBe(200);
    const firstPage = await readEnvelope<{ items: { ticketId: string }[] }>(first);
    expect(firstPage.items.map((item) => item.ticketId)).toContain(started.ticketId);

    expect(second.status).toBe(200);
    const secondPage = await readEnvelope<{ items: { ticketId: string }[] }>(second);
    expect(secondPage.items).toEqual([]);
  }
);

it.skipIf(!enabled)(
  "denies both tenant read routes without an authenticated session",
  async () => {
    const responses = [
      await supportSessionsRouter.request("/active"),
      await supportSessionsRouter.request("/history"),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
  }
);

it.skipIf(!enabled)(
  "walks the history with the opaque cursor and never repeats a ticket",
  async () => {
    const tickets: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const started = await startSession(organizationA);
      tickets.push(started.ticketId);
      await sendPlatform({
        method: "DELETE",
        path: `/impersonation/${started.ticketId}`,
        token: operator.token,
      });
    }

    const token = await createTenantToken(organizationA);
    const first = await supportSessionsRouter.request("/history?limit=2", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(first.status).toBe(200);
    const firstPage = await readEnvelope<{
      items: { ticketId: string }[];
      nextCursor: string | null;
    }>(first);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await supportSessionsRouter.request(
      `/history?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } }
    );
    expect(second.status).toBe(200);
    const secondPage = await readEnvelope<{
      items: { ticketId: string }[];
      nextCursor: string | null;
    }>(second);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();

    const seen = [...firstPage.items, ...secondPage.items].map(
      (item) => item.ticketId
    );
    expect(new Set(seen).size).toBe(3);
    expect([...seen].sort()).toEqual([...tickets].sort());
  }
);

it.skipIf(!enabled)(
  "reports another tenant's ticket as not found",
  async () => {
    const started = await startSession(organizationA);
    const response = await sendTenant(
      `/${started.ticketId}`,
      "DELETE",
      await createTenantToken(organizationB)
    );

    expect(response.status).toBe(404);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.SUPPORT_SESSION_NOT_FOUND
    );
  }
);

it.skipIf(!enabled)("lists the operator's active session for the marker", async () => {
  const started = await startSession(organizationA);

  const response = await sendPlatform({
    method: "GET",
    path: "/impersonation/active",
    token: operator.token,
  });

  expect(response.status).toBe(200);
  const body = await readEnvelope<{ items: OperatorSupportSession[] }>(response);
  expect(body.items.map((item) => item.ticketId)).toEqual([started.ticketId]);
});

it.skipIf(!enabled)(
  "reports the workspace's active session to the tenant banner (FR-048)",
  async () => {
    const token = await createTenantToken(organizationA);
    const before = await sendTenant("/active", "GET", token);
    expect(before.status).toBe(200);
    expect(
      await readEnvelope<{ active: boolean; session: unknown }>(before)
    ).toEqual({ active: false, session: null });

    const started = await startSession(organizationA);
    const after = await sendTenant("/active", "GET", token);
    expect(after.status).toBe(200);
    const active = await readEnvelope<{
      active: boolean;
      session: { ticketId: string; operatorDisplayName: string } | null;
    }>(after);

    expect(active.active).toBe(true);
    expect(active.session?.ticketId).toBe(started.ticketId);
    expect(active.session?.operatorDisplayName).not.toBe("");
  }
);

it.skipIf(!enabled)(
  "denies a tenant read when the session has no workspace scope",
  async () => {
    const token = await createTestSessionToken({
      userId: TENANT_USER_ID,
      organizationId: undefined,
      permissions: [PERMISSIONS.CORE.ORGANIZATION_UPDATE],
    });

    const response = await sendTenant("/active", "GET", token);

    expect(response.status).toBe(401);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.AUTH_REQUIRED
    );
  }
);

it.skipIf(!enabled)(
  "records an optional target user on the session row",
  async () => {
    const response = await sendPlatform({
      method: "POST",
      path: IMPERSONATION_PATH,
      token: operator.token,
      body: {
        organizationId: organizationA,
        reason: REASON,
        ticketRef: TICKET_REF,
        targetUserId: TENANT_USER_ID,
      },
    });

    expect(response.status).toBe(201);
    const started = await readEnvelope<StartResult>(response);
    const row = await fixture.ownerPrisma.impersonationSession.findUnique({
      where: { ticketId: started.ticketId },
      select: { targetUserId: true },
    });
    expect(row?.targetUserId).toBe(TENANT_USER_ID);
  }
);

it.skipIf(!enabled)(
  "refuses a support session into a workspace that does not exist",
  async () => {
    const response = await sendPlatform({
      method: "POST",
      path: IMPERSONATION_PATH,
      token: operator.token,
      body: {
        organizationId: "org_does_not_exist_237",
        reason: REASON,
        ticketRef: TICKET_REF,
      },
    });

    expect(response.status).toBe(404);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.TENANT_NOT_FOUND
    );
  }
);

it.skipIf(!enabled)(
  "refuses a support session into a workspace that is not active",
  async () => {
    const archived = await createOrganization("archived");
    await fixture.ownerPrisma.organization.update({
      where: { id: archived },
      data: { status: TENANT_STATUS.ARCHIVED },
    });

    const response = await sendPlatform({
      method: "POST",
      path: IMPERSONATION_PATH,
      token: operator.token,
      body: {
        organizationId: archived,
        reason: REASON,
        ticketRef: TICKET_REF,
      },
    });

    expect(response.status).toBe(422);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.TENANT_NOT_ACTIVE
    );
  }
);

it.skipIf(!enabled)(
  "rejects a tampered ticket with SUPPORT_SESSION_ENDED",
  async () => {
    const started = await startSession(organizationA);
    const [payload] = started.tenantBannerToken.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ticketId: started.ticketId,
        operatorId: operator.id,
        organizationId: organizationA,
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    ).toString("base64url");

    await expectSessionEnded(`${forged}.${payload}`);
  }
);

it.skipIf(!enabled)(
  "rejects an authentic ticket that has no session row",
  async () => {
    const orphan = signImpersonationTicket(getControlSessionSecret(), {
      ticketId: randomUUID(),
      operatorId: operator.id,
      organizationId: organizationA,
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    await expectSessionEnded(orphan);
  }
);

it.skipIf(!enabled)("rejects a cursor that is not base64 JSON", async () => {
  const response = await sendTenant(
    "/history?cursor=not-a-cursor",
    "GET",
    await createTenantToken(organizationA)
  );

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.VALIDATION_FAILED
  );
});

it.skipIf(!enabled)(
  "rejects a cursor whose payload has the wrong shape",
  async () => {
    const cursor = Buffer.from(JSON.stringify({ id: "only-id" })).toString(
      "base64url"
    );
    const response = await sendTenant(
      `/history?cursor=${encodeURIComponent(cursor)}`,
      "GET",
      await createTenantToken(organizationA)
    );

    expect(response.status).toBe(422);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.VALIDATION_FAILED
    );
  }
);

async function createTenantToken(organizationId: string): Promise<string> {
  return createTestSessionToken({
    userId: TENANT_USER_ID,
    organizationId,
    permissions: [PERMISSIONS.CORE.ORGANIZATION_UPDATE],
  });
}
