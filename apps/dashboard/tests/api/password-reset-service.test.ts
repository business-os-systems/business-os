import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from "../../src/services/password-reset.service";

const redisMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  enqueueEmail: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));
const authMocks = vi.hoisted(() => ({
  createPasswordResetToken: vi.fn(),
  completePasswordReset: vi.fn(),
  recordSecurityAuditLog: vi.fn(),
  sendEmail: vi.fn(),
  extractEffectivePermissions: vi.fn(() => ["branches:read"]),
}));

vi.mock("@suite/redis", () => ({
  checkRateLimit: redisMocks.checkRateLimit,
  enqueueEmail: redisMocks.enqueueEmail,
}));
vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));
vi.mock("@suite/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth")>();
  return {
    ...actual,
    createPasswordResetToken: authMocks.createPasswordResetToken,
    completePasswordReset: authMocks.completePasswordReset,
    recordSecurityAuditLog: authMocks.recordSecurityAuditLog,
    sendEmail: authMocks.sendEmail,
    extractEffectivePermissions: authMocks.extractEffectivePermissions,
  };
});

const ALLOWED = { allowed: true };
const BLOCKED = { allowed: false, retryAfter: 60, detail: "Too many attempts" };
const EMAIL = "user@example.com";
const ORIGIN = "https://app.example.com";
const PASSWORD = "SecurePassword123!";
const IP = "203.0.113.5";

function readRuleKeys(callIndex = 0): string[] {
  const call: unknown = redisMocks.checkRateLimit.mock.calls[callIndex];
  if (!Array.isArray(call)) return [];
  const rules: unknown = call[0];
  if (!Array.isArray(rules)) return [];
  return rules.map((rule: { key: string }) => rule.key);
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMocks.checkRateLimit.mockResolvedValue(ALLOWED);
  redisMocks.enqueueEmail.mockResolvedValue(undefined);
  authMocks.recordSecurityAuditLog.mockResolvedValue(undefined);
  authMocks.sendEmail.mockResolvedValue(undefined);
  authMocks.createPasswordResetToken.mockResolvedValue({ rawToken: "raw-token" });
});

describe("requestPasswordReset rate limiting", () => {
  it("adds an IP rule when a client IP is known and blocks over the limit", async () => {
    redisMocks.checkRateLimit.mockResolvedValue(BLOCKED);

    const result = await requestPasswordReset({ email: EMAIL, clientIp: IP, origin: ORIGIN });

    expect(result).toEqual({ status: "rate_limited", retryAfter: 60, detail: "Too many attempts" });
    expect(readRuleKeys()).toEqual([
      "ratelimit:forgot-password:ip:203.0.113.5",
      "ratelimit:forgot-password:user@example.com",
    ]);
  });

  it("only applies the email rule when no IP is known", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue(null);

    const result = await requestPasswordReset({ email: EMAIL, origin: ORIGIN });

    expect(result).toEqual({ status: "dispatched" });
    expect(readRuleKeys()).toHaveLength(1);
  });
});

describe("requestPasswordReset dispatch", () => {
  it("does not disclose an unknown email and skips the dispatch", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue(null);

    const result = await requestPasswordReset({ email: "unknown@example.com", origin: ORIGIN });

    expect(result).toEqual({ status: "dispatched" });
    expect(authMocks.createPasswordResetToken).not.toHaveBeenCalled();
    expect(redisMocks.enqueueEmail).not.toHaveBeenCalled();
  });

  it("enqueues the reset email for a known account", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue({ id: "usr_1", email: EMAIL });

    const result = await requestPasswordReset({ email: EMAIL, origin: ORIGIN });

    expect(result).toEqual({ status: "dispatched" });
    const sent = redisMocks.enqueueEmail.mock.calls[0]?.[0] as
      | { to?: string; text?: string }
      | undefined;
    expect(sent?.to).toBe(EMAIL);
    expect(sent?.text ?? "").toContain("reset-password?token=raw-token");
  });

  it("falls back to direct delivery when the queue is unavailable", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue({ id: "usr_1", email: EMAIL });
    redisMocks.enqueueEmail.mockRejectedValue(new Error("redis down"));

    const result = await requestPasswordReset({ email: EMAIL, origin: ORIGIN });

    expect(result).toEqual({ status: "dispatched" });
    expect(authMocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }));
  });
});

const USER = {
  id: "usr_1",
  name: "User",
  email: EMAIL,
  metadata: { onboarding_status: "COMPLETED", current_onboarding_step: 3 },
  organizations: [
    {
      organizationId: "org_1",
      status: "ACTIVE",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    },
    {
      organizationId: "org_2",
      status: "ACTIVE",
      organization: { id: "org_2", name: "Second", slug: "second" },
    },
  ],
  branchRoles: [
    {
      organizationId: "org_1",
      branchId: "br_1",
      branch: { id: "br_1", name: "HQ" },
      role: { name: "Member", permissions: [{ permission: { action: "branches:read" } }] },
    },
  ],
};

describe("resetPasswordWithToken rate limiting", () => {
  it("adds a token rule when a client IP is known and blocks over the limit", async () => {
    redisMocks.checkRateLimit.mockResolvedValue(BLOCKED);

    const result = await resetPasswordWithToken({
      token: "x".repeat(40),
      newPassword: PASSWORD,
      clientIp: IP,
    });

    expect(result).toEqual({ status: "rate_limited", retryAfter: 60, detail: "Too many attempts" });
    expect(readRuleKeys()).toEqual([
      "ratelimit:reset-password:ip:203.0.113.5",
      "ratelimit:reset-password:token:" + "x".repeat(32),
    ]);
  });

  it("uses only the token rule without a client IP", async () => {
    authMocks.completePasswordReset.mockResolvedValue({ success: false, reason: "INVALID_TOKEN" });

    await resetPasswordWithToken({ token: "short", newPassword: PASSWORD });

    expect(readRuleKeys()).toHaveLength(1);
  });
});

describe("resetPasswordWithToken failure mapping", () => {
  it.each([
    ["EXPIRED_TOKEN", { status: "expired_token" }],
    ["PASSWORD_COMPLEXITY_FAILED", { status: "complexity_failed", detail: "Too weak" }],
    ["INVALID_TOKEN", { status: "invalid_token" }],
  ])("maps the %s completion failure", async (reason, expected) => {
    authMocks.completePasswordReset.mockResolvedValue({
      success: false,
      reason,
      error: "Too weak",
    });

    const result = await resetPasswordWithToken({ token: "tkn", newPassword: "x" });

    expect(result).toMatchObject(expected);
  });

  it("falls back to the default complexity detail", async () => {
    authMocks.completePasswordReset.mockResolvedValue({
      success: false,
      reason: "PASSWORD_COMPLEXITY_FAILED",
    });

    const result = await resetPasswordWithToken({ token: "tkn", newPassword: "x" });

    expect(result).toEqual({
      status: "complexity_failed",
      detail: "Password does not meet complexity requirements.",
    });
  });
});

describe("resetPasswordWithToken session context", () => {
  it("returns the session context and records the audit for a successful reset", async () => {
    authMocks.completePasswordReset.mockResolvedValue({
      success: true,
      userId: "usr_1",
      email: EMAIL,
    });
    dbMocks.prisma.user.findUnique.mockResolvedValue(USER);

    const result = await resetPasswordWithToken({
      token: "tkn",
      newPassword: PASSWORD,
      clientIp: IP,
      userAgent: "vitest-agent",
    });

    expect(result.status).toBe("reset");
    if (result.status === "reset") {
      expect(result.context).toMatchObject({
        userId: "usr_1",
        organizationId: "org_1",
        roleName: "Member",
        activeBranchId: "br_1",
        permissions: ["branches:read"],
        hasMultipleWorkspaces: true,
      });
    }
    expect(authMocks.recordSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        userId: "usr_1",
        ipAddress: IP,
        userAgent: "vitest-agent",
      })
    );
  });

  it("falls back to a minimal context when the user record is gone", async () => {
    authMocks.completePasswordReset.mockResolvedValue({
      success: true,
      userId: "usr_1",
      email: EMAIL,
    });
    dbMocks.prisma.user.findUnique.mockResolvedValue(null);

    const result = await resetPasswordWithToken({ token: "tkn", newPassword: PASSWORD });

    expect(result.status).toBe("reset");
    if (result.status === "reset") {
      expect(result.context).toMatchObject({
        userId: "usr_1",
        email: EMAIL,
        userName: "user",
        permissions: [],
        themePreference: "system",
        hasMultipleWorkspaces: false,
      });
    }
  });
});
