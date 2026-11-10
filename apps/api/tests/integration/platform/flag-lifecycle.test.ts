import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlatformPrismaClient, type PrismaClient } from "@suite/db";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
  issueControlSession,
} from "@suite/auth/platform";
import {
  FLAG_ENVIRONMENTS,
  RULE_TYPES,
} from "@suite/flags/contracts";
import { platformFlagsRouter } from "../../../src/routes/admin/flags.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";
import {
  buildFlagCreateBody,
  buildFlagKey,
} from "../../helpers/flag-fixtures.js";
import { platformTestRpId } from "../../helpers/platform-rp.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

function controlPlaneOrigin(): string {
  const value = process.env.CONTROL_PLANE_ORIGIN;
  if (value === undefined || value.trim() === "") {
    throw new Error("CONTROL_PLANE_ORIGIN must be set for flag tests");
  }
  return value;
}
const tenantUrl = process.env.TENANT_DATABASE_URL;

type ProblemBody = { type: string; status: number; code: string };
type FlagRule = {
  id: string;
  ruleType: string;
  targetId: string;
  enabled: boolean;
  priority: number;
};

type FlagBody = {
  data: {
    id: string;
    key: string;
    environment: string;
    isEnabled: boolean;
    defaultEnabled: boolean;
    version: number;
    owner: string | null;
    expiresAt: string | null;
    removalTicket: string | null;
    isExpired: boolean;
    lifecycleComplete: boolean;
    rules: FlagRule[];
  };
};

type FlagPageBody = {
  data: {
    items: FlagBody["data"][];
    nextCursor: string | null;
  };
};

describe.skipIf(!enabled)("Platform flag lifecycle", () => {
  const suffix = Date.now().toString(36);
  const keyPrefix = `flag.${suffix}.`;
  const DEVELOPMENT = FLAG_ENVIRONMENTS[0];
  const STAGING = FLAG_ENVIRONMENTS[1];
  const operatorIds: string[] = [];
  const organizationIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let managerToken: string;
  let readerToken: string;
  let keyCounter = 0;
  let idempotencyCounter = 0;

  function nextKey(label: string): string {
    keyCounter += 1;
    return buildFlagKey({ suffix, label, index: keyCounter });
  }

  function createBody(key: string, overrides: Record<string, unknown> = {}) {
    return {
      ...buildFlagCreateBody({ key, environment: DEVELOPMENT }),
      ...overrides,
    };
  }

  async function createOperator(capabilities: readonly string[]): Promise<string> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `flag-lifecycle-${suffix}-${operatorIds.length}@example.com`,
        displayName: "Flag contract",
        status: "ACTIVE",
        mfaEnrolled: true,
      },
    });
    operatorIds.push(operator.id);
    for (const capability of capabilities) {
      await platformPrisma.operatorCapability.create({
        data: { operatorId: operator.id, capability },
      });
    }
    const session = await issueControlSession({
      prisma: platformPrisma,
      secret: secret ?? "",
      rpID: platformTestRpId(),
      operatorId: operator.id,
    });
    return session.token;
  }

  function request(
    method: string,
    path: string,
    token: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string | null
  ): Promise<Response> {
    const key =
      idempotencyKey === null
        ? null
        : idempotencyKey ??
          `idem-${suffix}-${(idempotencyCounter += 1)}`;
    return Promise.resolve(
      platformFlagsRouter.request(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
          Origin: controlPlaneOrigin(),
          "X-Forwarded-For": "198.51.100.14",
          ...(key === null ? {} : { "Idempotency-Key": key }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  }

  async function problem(response: Response): Promise<ProblemBody> {
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    return (await response.json()) as ProblemBody;
  }

  async function createFlag(key: string): Promise<FlagBody> {
    const response = await request("POST", "/", managerToken, createBody(key));
    expect(response.status).toBe(201);
    return (await response.json()) as FlagBody;
  }

  beforeAll(async () => {
    platformFlagsRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    await clearRateLimitStore("rl:admin:flags");
    managerToken = await createOperator([PLATFORM_CAPABILITIES.FLAGS_MANAGE.code]);
    readerToken = await createOperator([PLATFORM_CAPABILITIES.TELEMETRY_READ.code]);
  });

  afterAll(async () => {
    await ownerPrisma.featureFlag.deleteMany({
      where: { key: { startsWith: keyPrefix } },
    });
    await ownerPrisma.auditEvent.deleteMany({
      where: { actorOperatorId: { in: operatorIds } },
    });
    await ownerPrisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await ownerPrisma.operatorCapability.deleteMany({
      where: { operatorId: { in: operatorIds } },
    });
    await ownerPrisma.platformOperator.deleteMany({
      where: { id: { in: operatorIds } },
    });
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  it("creates a flag off with lifecycle metadata and writes its audit row", async () => {
    const key = nextKey("create");
    const body = await createFlag(key);

    expect(body.data).toMatchObject({
      key,
      isEnabled: false,
      defaultEnabled: false,
      version: 1,
      owner: "platform@example.com",
      removalTicket: "#224",
      lifecycleComplete: true,
      isExpired: false,
    });

    const audit = await ownerPrisma.featureFlagAuditLog.findMany({
      where: { flagKey: key },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.source).toBe("API");
    expect(audit[0]?.actorUserId).toBeDefined();

    const platformAudit = await ownerPrisma.auditEvent.findFirst({
      where: {
        action: PLATFORM_AUDIT_ACTIONS.FLAG_CREATED,
        entityId: body.data.id,
      },
    });
    expect(platformAudit?.actorOperatorId).toBeDefined();
  });

  it("rejects a key without an app namespace", async () => {
    const response = await request(
      "POST",
      "/",
      managerToken,
      createBody("offline")
    );
    expect(response.status).toBe(422);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  });

  it("refuses creation without owner, expiry and removal ticket", async () => {
    const response = await request("POST", "/", managerToken, {
      key: nextKey("incomplete"),
      name: "Incomplete flag",
      environment: DEVELOPMENT,
    });
    expect(response.status).toBe(422);
    expect((await problem(response)).status).toBe(422);
  });

  it("enables a complete flag and audits the update", async () => {
    const key = nextKey("enable");
    await createFlag(key);

    const response = await request("PATCH", `/${key}?environment=${DEVELOPMENT}`, managerToken, {
      expectedVersion: 1,
      isEnabled: true,
      reason: "Enable for the rollout",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as FlagBody;
    expect(body.data).toMatchObject({
      isEnabled: true,
      version: 2,
      owner: "platform@example.com",
      removalTicket: "#224",
    });
    expect(body.data.expiresAt).not.toBeNull();

    const audit = await ownerPrisma.featureFlagAuditLog.findMany({
      where: { flagKey: key },
      orderBy: { createdAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[1]?.reason).toBe("Enable for the rollout");
  });

  it("refuses to enable an expired flag", async () => {
    const key = nextKey("expired");
    await createFlag(key);
    await ownerPrisma.featureFlag.updateMany({
      where: { key },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await request("PATCH", `/${key}?environment=${DEVELOPMENT}`, managerToken, {
      expectedVersion: 1,
      isEnabled: true,
    });
    expect(response.status).toBe(409);
    expect(await problem(response)).toMatchObject({
      status: 409,
      code: PLATFORM_ERROR_CODE.FLAG_EXPIRED,
      type: "/errors/flag-expired",
    });
  });

  it("rejects a stale expected version", async () => {
    const key = nextKey("stale");
    await createFlag(key);

    const response = await request("PATCH", `/${key}?environment=${DEVELOPMENT}`, managerToken, {
      expectedVersion: 99,
      isEnabled: false,
    });
    expect(response.status).toBe(409);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.FLAG_VERSION_CONFLICT,
    });
  });

  it("rejects a duplicate key in the same environment", async () => {
    const key = nextKey("duplicate");
    await createFlag(key);

    const response = await request("POST", "/", managerToken, createBody(key));
    expect(response.status).toBe(409);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.FLAG_EXISTS,
    });
  });

  it("scopes an update to the requested environment", async () => {
    const key = nextKey("scoped");
    await createFlag(key);

    const response = await request("PATCH", `/${key}?environment=${STAGING}`, managerToken, {
      expectedVersion: 1,
      isEnabled: true,
    });
    expect(response.status).toBe(404);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.FLAG_NOT_FOUND,
    });
  });

  it("denies an operator without the flags capability", async () => {
    const response = await request("GET", "/", readerToken);
    expect(response.status).toBe(403);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      type: "/errors/capability-denied",
    });
  });

  it("pages the flag list with a stable cursor", async () => {
    for (const label of ["page_a", "page_b", "page_c"]) {
      await createFlag(nextKey(label));
    }

    const first = await request("GET", "/?limit=2", managerToken);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as FlagPageBody;
    expect(firstBody.data.items).toHaveLength(2);
    const cursor = firstBody.data.nextCursor;
    expect(cursor).not.toBeNull();
    if (cursor === null) {
      throw new Error("The first page did not return a cursor");
    }

    const second = await request(
      "GET",
      `/?limit=2&cursor=${encodeURIComponent(cursor)}`,
      managerToken
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as FlagPageBody;
    expect(secondBody.data.items.length).toBeGreaterThan(0);
    const firstKeys = firstBody.data.items.map((item) => item.key);
    for (const item of secondBody.data.items) {
      expect(firstKeys).not.toContain(item.key);
    }
  });

  it("replaces targeting rules and audits them", async () => {
    const key = nextKey("rules");
    await createFlag(key);
    const organization = await ownerPrisma.organization.create({
      data: {
        name: "Flag targeting " + suffix,
        slug: "flag-targeting-" + suffix,
        status: "ACTIVE",
      },
    });
    organizationIds.push(organization.id);

    const response = await request(
      "PATCH",
      `/${key}?environment=${DEVELOPMENT}`,
      managerToken,
      {
        expectedVersion: 1,
        rules: [
          {
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: organization.id,
            enabled: true,
            priority: 10,
          },
          {
            ruleType: RULE_TYPES.ENVIRONMENT,
            targetId: FLAG_ENVIRONMENTS[2],
            enabled: false,
            priority: 0,
          },
        ],
        reason: "Target the pilot tenant",
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as FlagBody;
    expect(body.data.rules).toHaveLength(2);
    expect(body.data.rules[0]?.ruleType).toBe("ORGANIZATION");

    const list = await request("GET", "/?limit=100", managerToken);
    const listBody = (await list.json()) as FlagPageBody;
    const found = listBody.data.items.find((item) => item.key === key);
    expect(found?.rules).toHaveLength(2);

    const audit = await ownerPrisma.featureFlagAuditLog.findFirst({
      where: { flagKey: key, reason: "Target the pilot tenant" },
    });
    const newState = audit?.newState as { rules?: unknown[] } | null;
    expect(newState?.rules).toHaveLength(2);
  });

  it("writes the platform audit chain for flag mutations", async () => {
    const key = nextKey("audit_chain");
    const created = await createFlag(key);

    const update = await request(
      "PATCH",
      `/${key}?environment=${DEVELOPMENT}`,
      managerToken,
      { expectedVersion: 1, isEnabled: true, reason: "Audit chain check" }
    );
    expect(update.status).toBe(200);

    const createdAudit = await ownerPrisma.auditEvent.findFirst({
      where: {
        action: PLATFORM_AUDIT_ACTIONS.FLAG_CREATED,
        entityId: created.data.id,
      },
    });
    expect(createdAudit?.actorOperatorId).toBeDefined();

    const updatedAudit = await ownerPrisma.auditEvent.findFirst({
      where: {
        action: PLATFORM_AUDIT_ACTIONS.FLAG_UPDATED,
        entityId: created.data.id,
      },
    });
    expect(updatedAudit?.actorOperatorId).toBeDefined();
    expect(updatedAudit?.reason).toBe("Audit chain check");
  });

  it("replays a mutation with the same idempotency key", async () => {
    const key = nextKey("idem");
    const idempotencyKey = `idem-${suffix}-replay`;

    const first = await request(
      "POST",
      "/",
      managerToken,
      createBody(key),
      idempotencyKey
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as FlagBody;

    const replay = await request(
      "POST",
      "/",
      managerToken,
      createBody(key),
      idempotencyKey
    );
    expect(replay.status).toBe(201);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    const replayBody = (await replay.json()) as FlagBody;
    expect(replayBody.data.id).toBe(firstBody.data.id);
  });

  it("requires an idempotency key for mutations", async () => {
    const response = await request(
      "POST",
      "/",
      managerToken,
      createBody(nextKey("nokey")),
      null
    );
    expect(response.status).toBe(422);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED,
    });
  });

  it("rejects a malformed cursor", async () => {
    const response = await request("GET", "/?cursor=not-a-cursor", managerToken);
    expect(response.status).toBe(422);
    expect(await problem(response)).toMatchObject({
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  });

  it.skipIf(tenantUrl === undefined)(
    "denies the tenant identity on the flag tables",
    async () => {
      if (tenantUrl === undefined) {
        throw new Error("TENANT_DATABASE_URL is required for this test");
      }
      const tenantPrisma = createPlatformPrismaClient({ databaseUrl: tenantUrl });
      await expect(tenantPrisma.featureFlag.findMany()).rejects.toThrow(
        /42501|permission denied/i
      );
      await tenantPrisma.$disconnect();
    }
  );
});
