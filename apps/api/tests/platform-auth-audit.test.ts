import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import type { PlatformAuthDependencies } from "../src/services/admin/platform-auth.service.js";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(async () => undefined),
  issueSession: vi.fn(async () => ({
    token: "token",
    sessionId: "session_1",
    expiresAt: new Date(),
    idleExpiresAt: new Date(),
    cookie: {},
  })),
  capabilities: vi.fn(async () => ["platform:tenants:read"]),
  readBootstrapToken: vi.fn(async () => ({
    operatorId: "op_1",
    email: "ops@example.com",
  })),
  consumeBootstrapToken: vi.fn(async () => ({
    operatorId: "op_1",
    email: "ops@example.com",
  })),
  hashBootstrapToken: vi.fn(async () => "token-hash"),
  verifySession: vi.fn(async () => ({
    valid: true as const,
    operatorId: "op_1",
    sessionId: "session_1",
    expiresAt: new Date(),
    idleExpiresAt: new Date(),
  })),
  revokeSession: vi.fn(async () => undefined),
  finishRegistration: vi.fn(async () => ({
    operatorId: "op_1",
    tokenHash: "token-hash",
    credential: {
      id: "credential_1",
      publicKey: "public-key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: ["internal"],
    },
  })),
  finishAuthentication: vi.fn(async () => 1),
}));

vi.mock("@suite/auth/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth/platform")>();
  return {
    ...actual,
    appendPlatformAuditEvent: mocks.audit,
    issueControlSession: mocks.issueSession,
    resolvePlatformCapabilities: mocks.capabilities,
    readBootstrapToken: mocks.readBootstrapToken,
    consumeBootstrapToken: mocks.consumeBootstrapToken,
    hashBootstrapToken: mocks.hashBootstrapToken,
    verifyAndTouchControlSession: mocks.verifySession,
    revokeControlSession: mocks.revokeSession,
  };
});

vi.mock("../src/services/admin/platform-webauthn.service.js", () => ({
  finishRegistration: mocks.finishRegistration,
  finishAuthentication: mocks.finishAuthentication,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

import {
  finishBootstrap,
  finishSignIn,
  logout,
} from "../src/services/admin/platform-auth.service.js";

const operator = {
  id: "op_1",
  email: "ops@example.com",
  displayName: "Ops",
  status: "INVITED",
  mfaEnrolled: false,
};

function dependencies(options: { passkeyFound?: boolean } = {}): PlatformAuthDependencies {
  const tx = {
    operatorPasskey: {
      create: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
    platformOperator: { update: vi.fn(async () => undefined) },
  };
  const prisma = {
    platformOperator: {
      findUnique: vi.fn(async () => operator),
      update: vi.fn(async () => undefined),
    },
    operatorPasskey: {
      create: vi.fn(async () => undefined),
      findUnique: vi.fn(async () =>
        options.passkeyFound === false
          ? null
          : {
              id: "passkey_1",
              operatorId: "op_1",
              credentialId: "credential_1",
              publicKey: "public-key",
              counter: 0,
              transports: "internal",
              operator: { ...operator, status: "ACTIVE", mfaEnrolled: true },
            }
      ),
      update: vi.fn(async () => undefined),
    },
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
      fn(tx)
    ),
  } as unknown as PrismaClient;

  return {
    prisma,
    redis: {} as Redis,
    secret: "platform-auth-test-secret-32-characters",
    config: {
      rpID: "localhost",
      rpName: "Business OS Platform",
      origin: "http://localhost:3002",
    },
  };
}

const context = {
  requestId: "req_audit",
  ip: null,
  userAgent: null,
};

describe("Platform auth audit events", () => {
  beforeEach(() => {
    mocks.audit.mockClear();
    mocks.finishRegistration.mockClear();
    mocks.finishAuthentication.mockClear();
    mocks.verifySession.mockClear();
    mocks.revokeSession.mockClear();
    mocks.consumeBootstrapToken.mockClear();
  });

  it("audits a sign-in failure for an unknown credential", async () => {
    await expect(
      finishSignIn(dependencies({ passkeyFound: false }), {
        flowId: "flow_unknown",
        response: { id: "unknown" } as never,
        ...context,
      })
    ).rejects.toThrow(/Sign-in failed/);

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: PLATFORM_AUDIT_ACTIONS.SIGN_IN_FAILED,
        reason: "UNKNOWN_CREDENTIAL",
      })
    );
  });

  it("audits first-operator passkey registration and sign-in", async () => {
    await finishBootstrap(dependencies(), {
      token: "bootstrap-token",
      flowId: "flow_1",
      response: {} as never,
      ...context,
    });

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED })
    );
  });

  it("audits sign-in success", async () => {
    await finishSignIn(dependencies(), {
      flowId: "flow_2",
      response: { id: "credential_1" } as never,
      ...context,
    });

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: PLATFORM_AUDIT_ACTIONS.SIGNED_IN })
    );
  });

  it("audits logout", async () => {
    await logout(dependencies(), {
      token: "session-token",
      requestId: "req_audit",
    });

    expect(mocks.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session_1" })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: PLATFORM_AUDIT_ACTIONS.SIGNED_OUT })
    );
  });
});
