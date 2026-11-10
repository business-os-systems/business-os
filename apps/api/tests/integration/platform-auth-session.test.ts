import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPlatformPrismaClient,
  type PrismaClient,
} from "@suite/db";
import {
  appendPlatformAuditEvent,
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import { platformAuthRouter } from "../../src/routes/admin/auth.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";
import { platformTestRpId } from "../helpers/platform-rp.js";

loadPlatformTestEnv();

const databaseUrl = process.env.PLATFORM_DATABASE_URL;
const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = Boolean(databaseUrl && secret);

describe.skipIf(!enabled)("Platform auth session lifecycle", () => {
  let prisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let operatorId: string;
  let token: string;

  beforeAll(async () => {
    process.env.CONTROL_PLANE_ORIGIN = "http://localhost:3002";
    platformAuthRouter.onError(globalErrorHandler);
    prisma = createPlatformPrismaClient({ databaseUrl: databaseUrl ?? "" });
    ownerPrisma = createPlatformPrismaClient({
      databaseUrl: process.env.DATABASE_URL ?? "",
    });

    const operator = await prisma.platformOperator.create({
      data: {
        email: `auth-session-${Date.now()}@example.com`,
        displayName: "Auth Session Test",
        status: "ACTIVE",
        mfaEnrolled: true,
      },
    });
    operatorId = operator.id;
    await prisma.operatorCapability.create({
      data: {
        operatorId,
        capability: "platform:tenants:read",
      },
    });
    const issued = await issueControlSession({
      prisma,
      secret: secret ?? "",
      rpID: platformTestRpId(),
      operatorId,
    });
    token = issued.token;
  });

  afterAll(async () => {
    if (operatorId) {
      // RESTRICT (D-027): audit history outlives its actor, so the fixture rows
      // are removed explicitly before the operator.
      await ownerPrisma.auditEvent.deleteMany({
        where: { actorOperatorId: operatorId },
      });
      await ownerPrisma.platformOperator.delete({ where: { id: operatorId } });
    }
    await prisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  it("hydrates the operator and capabilities from /me", async () => {
    const response = await platformAuthRouter.request("/me", {
      headers: {
        Origin: "http://localhost:3002",
        Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        operator: { id: string };
        capabilities: string[];
      };
    };
    expect(body.data.operator.id).toBe(operatorId);
    expect(body.data.capabilities).toContain("platform:tenants:read");
  });

  it("writes a bootstrap audit event through the append-only trigger", async () => {
    const event = await appendPlatformAuditEvent(prisma, {
      actorOperatorId: null,
      action: PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED,
      entityType: "PlatformOperator",
      entityId: operatorId,
      requestId: `bootstrap:${operatorId}`,
    });
    expect(event.action).toBe(PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED);
    expect(event.recordHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("revokes the session, clears the cookie and audits logout", async () => {
    const response = await platformAuthRouter.request("/logout", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3002",
        Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain(
      `${CONTROL_SESSION_COOKIE_NAME}=`
    );

    const session = await prisma.operatorSession.findFirst({
      where: { operatorId },
      orderBy: { issuedAt: "desc" },
    });
    expect(session?.revokedAt).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: {
        actorOperatorId: operatorId,
        action: PLATFORM_AUDIT_ACTIONS.SIGNED_OUT,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.recordHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
