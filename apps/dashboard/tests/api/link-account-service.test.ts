import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIT_EVENT_TYPES } from "@suite/core";
import { linkAccountWithPassword } from "../../src/services/link-account.service";

const redisMocks = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));
const authMocks = vi.hoisted(() => ({
  linkOAuthAccountWithPassword: vi.fn(),
  getBetterAuthSecret: vi.fn(() => "secret"),
  recordSecurityAuditLog: vi.fn(),
  extractEffectivePermissions: vi.fn(() => ["branches:read"]),
}));

vi.mock("@suite/redis", () => ({ checkRateLimit: redisMocks.checkRateLimit }));
vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));
vi.mock("@suite/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth")>();
  return {
    ...actual,
    linkOAuthAccountWithPassword: authMocks.linkOAuthAccountWithPassword,
    getBetterAuthSecret: authMocks.getBetterAuthSecret,
    recordSecurityAuditLog: authMocks.recordSecurityAuditLog,
    extractEffectivePermissions: authMocks.extractEffectivePermissions,
  };
});

const LINKED_USER = {
  id: "usr_1",
  email: "user@example.com",
  name: "User",
  metadata: { onboarding_status: "COMPLETED" },
  organizations: [
    {
      organizationId: "org_1",
      organization: { id: "org_1", name: "Acme", slug: "acme" },
    },
  ],
  branchRoles: [
    {
      organizationId: "org_1",
      role: { name: "Member", permissions: [{ permission: { action: "branches:read" } }] },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  redisMocks.checkRateLimit.mockResolvedValue({ allowed: true });
  authMocks.recordSecurityAuditLog.mockResolvedValue(undefined);
  authMocks.linkOAuthAccountWithPassword.mockResolvedValue({
    success: true,
    userId: "usr_1",
    providerId: "google",
    accountId: "acct_1",
  });
  dbMocks.prisma.user.findUnique.mockResolvedValue(LINKED_USER);
});

describe("linkAccountWithPassword", () => {
  it("adds an IP rule when a client IP is known", async () => {
    redisMocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30, detail: "Slow" });

    const result = await linkAccountWithPassword({
      ticket: "ticket",
      password: "password",
      clientIp: "203.0.113.5",
    });

    expect(result).toEqual({ status: "rate_limited", retryAfter: 30, detail: "Slow" });
    const [rules] = redisMocks.checkRateLimit.mock.calls[0] as [{ key: string }[]];
    expect(rules.map((rule) => rule.key)).toEqual([
      "ratelimit:link-account:ip:203.0.113.5",
      "ratelimit:link-account:ticket:ticket",
    ]);
  });

  it("uses only the ticket rule without a client IP", async () => {
    await linkAccountWithPassword({ ticket: "ticket", password: "password" });

    const [rules] = redisMocks.checkRateLimit.mock.calls[0] as [{ key: string }[]];
    expect(rules).toHaveLength(1);
  });

  it.each([
    ["INVALID_TICKET", { status: "invalid_ticket" }],
    ["EXPIRED_TICKET", { status: "invalid_ticket" }],
    ["INVALID_PASSWORD", { status: "invalid_password" }],
    ["UNKNOWN", { status: "account_not_found" }],
  ])("maps the %s failure", async (reason, expected) => {
    authMocks.linkOAuthAccountWithPassword.mockResolvedValue({ success: false, reason });

    const result = await linkAccountWithPassword({ ticket: "ticket", password: "password" });

    expect(result).toEqual(expected);
  });

});

describe("linkAccountWithPassword linked context", () => {
  it("returns user_not_found when the linked user disappeared", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue(null);

    const result = await linkAccountWithPassword({ ticket: "ticket", password: "password" });

    expect(result).toEqual({ status: "user_not_found" });
  });

  it("returns the linked context and records the audit", async () => {
    const result = await linkAccountWithPassword({
      ticket: "ticket",
      password: "password",
      clientIp: "203.0.113.5",
      userAgent: "vitest-agent",
    });

    expect(result.status).toBe("linked");
    if (result.status === "linked") {
      expect(result.context).toMatchObject({
        userId: "usr_1",
        organizationId: "org_1",
        roleName: "Member",
        permissions: ["branches:read"],
      });
    }
    expect(authMocks.recordSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_EVENT_TYPES.AUTH_ACCOUNT_LINKED,
        ipAddress: "203.0.113.5",
        userAgent: "vitest-agent",
      })
    );
  });

  it("falls back to the owner role while onboarding is in progress", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue({
      ...LINKED_USER,
      metadata: { onboarding_status: "IN_PROGRESS" },
      branchRoles: [],
    });

    const result = await linkAccountWithPassword({ ticket: "ticket", password: "password" });

    expect(result.status).toBe("linked");
    if (result.status === "linked") {
      expect(result.context.roleName).toBe("owner");
    }
  });

  it("falls back to the member role once onboarding completed without a branch role", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValue({
      ...LINKED_USER,
      metadata: { onboarding_status: "COMPLETED" },
      branchRoles: [],
    });

    const result = await linkAccountWithPassword({ ticket: "ticket", password: "password" });

    expect(result.status).toBe("linked");
    if (result.status === "linked") {
      expect(result.context.roleName).toBe("member");
    }
  });
});
