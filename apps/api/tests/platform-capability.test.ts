import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { OperatorSession, PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import {
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
} from "@suite/auth/platform";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import { createPlatformCapabilityGuard } from "../src/middleware/platform-capability.js";

const SECRET = "capability-guard-test-secret-32-characters";
const OPERATOR_ID = "op_guard_1";

type StoredSession = OperatorSession & { operator: { status: "ACTIVE" } };

function createFakePrisma(capabilities: string[]) {
  const sessions = new Map<string, StoredSession>();
  const findMany = vi.fn(async () =>
    capabilities.map((capability) => ({ capability }))
  );
  const prisma = {
    operatorSession: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = {
          ...data,
          revokedAt: null,
          operator: { status: "ACTIVE" },
        } as unknown as StoredSession;
        sessions.set(record.tokenHash, record);
        return record;
      }),
      findUnique: vi.fn(async (args: { where: { tokenHash?: string; id?: string } }) => {
        if (args.where.tokenHash) {
          return sessions.get(args.where.tokenHash) ?? null;
        }
        return (
          [...sessions.values()].find((session) => session.id === args.where.id) ??
          null
        );
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { idleExpiresAt: Date } }) => {
        const session = [...sessions.values()].find(
          (candidate) => candidate.id === where.id
        );
        if (session) {
          session.idleExpiresAt = data.idleExpiresAt;
        }
        return session;
      }),
    },
    operatorCapability: { findMany },
  } as unknown as PrismaClient;

  return { prisma, findMany };
}

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => store.delete(key)),
  } as unknown as Redis;
}

async function createApp(capabilities: string[]) {
  const { prisma } = createFakePrisma(capabilities);
  const redis = createFakeRedis();
  const issued = await issueControlSession({
    prisma,
    secret: SECRET,
    operatorId: OPERATOR_ID,
  });

  const app = new Hono<{ Variables: { requestId: string; operatorId: string; platformCapabilities: readonly string[] } }>();
  app.onError(globalErrorHandler);
  app.use(
    "*",
    createPlatformCapabilityGuard({
      prisma,
      redis,
      secret: SECRET,
      capability: "platform:tenants:read",
    })
  );
  app.get("/", (c) =>
    c.json({
      operatorId: c.get("operatorId"),
      capabilities: c.get("platformCapabilities"),
    })
  );

  return { app, token: issued.token };
}

describe("Platform capability guard", () => {
  it("admits an operator holding the required capability", async () => {
    const { app, token } = await createApp(["platform:tenants:read"]);
    const response = await app.request("/", {
      headers: {
        Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      operatorId: string;
      capabilities: string[];
    };
    expect(body.operatorId).toBe(OPERATOR_ID);
    expect(body.capabilities).toContain("platform:tenants:read");
  });

  it("rejects a missing control session", async () => {
    const { app } = await createApp(["platform:tenants:read"]);
    const response = await app.request("/");

    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("denies an operator without the required capability", async () => {
    const { app, token } = await createApp(["platform:audit:read"]);
    const response = await app.request("/", {
      headers: {
        Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("CAPABILITY_DENIED");
  });
});
