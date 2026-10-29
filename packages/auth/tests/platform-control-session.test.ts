import { describe, expect, it, vi } from "vitest";
import type { OperatorSession, PrismaClient } from "@suite/db";
import {
  CONTROL_SESSION_IDLE_SECONDS,
  createControlSessionCookieOptions,
  issueControlSession,
  revokeControlSession,
  touchControlSession,
  verifyAndTouchControlSession,
  verifyControlSession,
} from "../src/platform/index.js";
import { signPlatformToken } from "../src/platform/token.js";

type OperatorStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
type StoredSession = OperatorSession & { operator: { status: OperatorStatus } };

interface SessionCreateData {
  id: string;
  operatorId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

function createFakePrisma() {
  const sessions = new Map<string, StoredSession>();

  const prisma = {
    operatorSession: {
      create: vi.fn(async ({ data }: { data: SessionCreateData }) => {
        const record: StoredSession = {
          ...data,
          revokedAt: null,
          operator: { status: "ACTIVE" },
        };
        sessions.set(data.tokenHash, record);
        return record;
      }),
      findUnique: vi.fn(
        async (args: { where: { tokenHash?: string; id?: string } }) => {
          if (args.where.tokenHash) {
            return sessions.get(args.where.tokenHash) ?? null;
          }
          if (args.where.id) {
            return (
              [...sessions.values()].find(
                (session) => session.id === args.where.id
              ) ?? null
            );
          }
          return null;
        }
      ),
      update: vi.fn(
        async (args: { where: { id: string }; data: { idleExpiresAt: Date } }) => {
          const session = [...sessions.values()].find(
            (candidate) => candidate.id === args.where.id
          );
          if (!session) {
            throw new Error("session not found");
          }
          session.idleExpiresAt = args.data.idleExpiresAt;
          return session;
        }
      ),
      updateMany: vi.fn(
        async (args: {
          where: { id: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => {
          const session = [...sessions.values()].find(
            (candidate) => candidate.id === args.where.id
          );
          if (!session || session.revokedAt !== null) {
            return { count: 0 };
          }
          session.revokedAt = args.data.revokedAt;
          return { count: 1 };
        }
      ),
    },
  } as unknown as PrismaClient;

  return { prisma, sessions };
}

const SECRET = "control-session-test-secret-32-characters";
const OPERATOR_ID = "op_test_1";

describe("@suite/auth - Platform control session", () => {
  it("issues a host-only cookie and stores only the token hash", async () => {
    const { prisma, sessions } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");

    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now,
    });

    expect(issued.cookie).toMatchObject(
      createControlSessionCookieOptions()
    );
    expect(issued.cookie).not.toHaveProperty("domain");
    expect(issued.cookie.name).toBe("__Host-bos_ops");

    const stored = [...sessions.values()][0];
    expect(stored?.tokenHash).not.toBe(issued.token);
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies an active session and returns the operator", async () => {
    const { prisma } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now,
    });

    const result = await verifyControlSession({
      prisma,
      secret: SECRET,
      token: issued.token,
      now: new Date(now.getTime() + 60_000),
    });

    expect(result).toMatchObject({
      valid: true,
      operatorId: OPERATOR_ID,
      sessionId: issued.sessionId,
    });
  });

  it("rejects a token with the wrong audience", async () => {
    const { prisma } = createFakePrisma();
    const now = Math.floor(Date.now() / 1000);
    const token = await signPlatformToken(
      {
        aud: "tenant",
        iss: "business-os-platform",
        sub: OPERATOR_ID,
        sid: "session_1",
        jti: "jti_1",
        iat: now,
        exp: now + 3600,
        idleExp: now + 1800,
      },
      SECRET
    );

    const result = await verifyControlSession({
      prisma,
      secret: SECRET,
      token,
    });

    expect(result).toEqual({ valid: false, reason: "malformed" });
  });

  it("rejects a revoked session", async () => {
    const { prisma, sessions } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now,
    });
    const stored = [...sessions.values()][0];
    if (stored) {
      stored.revokedAt = now;
    }

    const result = await verifyControlSession({
      prisma,
      secret: SECRET,
      token: issued.token,
      now: new Date(now.getTime() + 60_000),
    });

    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("rejects an expired session", async () => {
    const { prisma } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now: new Date(now.getTime() - 9 * 60 * 60 * 1000),
    });

    const result = await verifyControlSession({
      prisma,
      secret: SECRET,
      token: issued.token,
      now,
    });

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects an idle session", async () => {
    const { prisma } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now: new Date(
        now.getTime() - (CONTROL_SESSION_IDLE_SECONDS + 60) * 1000
      ),
    });

    const result = await verifyControlSession({
      prisma,
      secret: SECRET,
      token: issued.token,
      now,
    });

    expect(result).toEqual({ valid: false, reason: "idle_timeout" });
  });

  it("touches idle expiry without exceeding the absolute expiry", async () => {
    const { prisma, sessions } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now,
    });

    const touched = await touchControlSession({
      prisma,
      sessionId: issued.sessionId,
      now: new Date(now.getTime() + 20 * 60 * 1000),
    });
    expect(touched).toBe(true);

    const stored = [...sessions.values()][0];
    expect(stored?.idleExpiresAt.getTime()).toBe(
      now.getTime() + 50 * 60 * 1000
    );
  });

  it("verifies and touches a session in one step", async () => {
    const { prisma, sessions } = createFakePrisma();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
      now,
    });

    const result = await verifyAndTouchControlSession({
      prisma,
      secret: SECRET,
      token: issued.token,
      now: new Date(now.getTime() + 20 * 60 * 1000),
    });
    expect(result.valid).toBe(true);

    const stored = [...sessions.values()][0];
    expect(stored?.idleExpiresAt.getTime()).toBe(
      now.getTime() + 50 * 60 * 1000
    );
  });

  it("revokes a session once", async () => {
    const { prisma } = createFakePrisma();
    const issued = await issueControlSession({
      prisma,
      secret: SECRET,
      operatorId: OPERATOR_ID,
    });

    await expect(
      revokeControlSession({ prisma, sessionId: issued.sessionId })
    ).resolves.toBe(true);
    await expect(
      revokeControlSession({ prisma, sessionId: issued.sessionId })
    ).resolves.toBe(false);
  });
});
