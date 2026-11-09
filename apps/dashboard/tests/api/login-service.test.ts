import { beforeEach, describe, expect, it, vi } from "vitest";
import { partiallyMatches } from "./expect-matchers";
import { AUDIT_EVENT_TYPES } from "@suite/core";
import { authenticateWithPassword, recordSuccessfulLogin } from "../../src/services/login.service";

const dbMocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    auditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

const passwordMocks = vi.hoisted(() => ({ verifyPassword: vi.fn() }));

vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));
vi.mock("@suite/auth/password", () => ({ verifyPassword: passwordMocks.verifyPassword }));

const EMAIL = "owner@company.com";

function buildUser(organizationStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
  return {
    id: "usr_login_1",
    email: EMAIL,
    name: "Owner",
    metadata: { onboarding_status: "COMPLETED" },
    accounts: [{ providerId: "credential", password: "hashed" }],
    organizations: [
      { organization: { id: "org_1", name: "River View", status: organizationStatus } },
    ],
    branchRoles: [
      {
        branchId: "branch_main",
        branch: { name: "Main Location" },
        role: {
          name: "Organization Owner",
          slug: "owner",
          permissions: [{ permission: { action: "core:organization:read" } }],
        },
      },
    ],
  };
}

describe("login service credential checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.prisma.auditLog.findFirst.mockResolvedValue(null);
    dbMocks.prisma.auditLog.create.mockResolvedValue({});
  });

  it("rejects an unknown email with invalid_credentials", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      authenticateWithPassword({ email: EMAIL, password: "secret" })
    ).resolves.toEqual({ status: "invalid_credentials" });
  });

  it("rejects a wrong password with invalid_credentials", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce(buildUser("ACTIVE"));
    passwordMocks.verifyPassword.mockResolvedValueOnce(false);
    await expect(
      authenticateWithPassword({ email: EMAIL, password: "wrong" })
    ).resolves.toEqual({ status: "invalid_credentials" });
  });
});

describe("login service workspace lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.prisma.auditLog.findFirst.mockResolvedValue(null);
    dbMocks.prisma.auditLog.create.mockResolvedValue({});
  });

  it("refuses a suspended workspace and records the rejection", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce(buildUser("SUSPENDED"));
    passwordMocks.verifyPassword.mockResolvedValueOnce(true);

    const result = await authenticateWithPassword({
      email: EMAIL,
      password: "correct",
      ipAddress: "10.0.0.1",
    });

    expect(result).toEqual({ status: "workspace_suspended" });
    expect(dbMocks.prisma.auditLog.create).toHaveBeenCalledWith(
      partiallyMatches({
        data: partiallyMatches({
          action: AUDIT_EVENT_TYPES.AUTH_LOGIN_REJECTED,
          newData: partiallyMatches({ reason: "WORKSPACE_SUSPENDED" }),
        }),
      })
    );
  });

  it("returns the authenticated context for an active workspace", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce(buildUser("ACTIVE"));
    passwordMocks.verifyPassword.mockResolvedValueOnce(true);

    const result = await authenticateWithPassword({ email: EMAIL, password: "correct" });

    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") {
      return;
    }
    expect(result.context).toEqual(
      partiallyMatches({
        userId: "usr_login_1",
        organizationId: "org_1",
        activeBranchId: "branch_main",
        roleSlug: "owner",
        permissions: ["core:organization:read"],
        onboardingStatus: "COMPLETED",
      })
    );
  });

  it("records a successful login audit entry", async () => {
    dbMocks.prisma.auditLog.create.mockResolvedValue({});
    await recordSuccessfulLogin({
      userId: "usr_login_1",
      organizationId: "org_1",
      ipAddress: "10.0.0.1",
    });

    expect(dbMocks.prisma.auditLog.create).toHaveBeenCalledWith(
      partiallyMatches({
        data: partiallyMatches({
          action: AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
          actorUserId: "usr_login_1",
        }),
      })
    );
  });
});
