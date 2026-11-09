import { beforeEach, describe, expect, it, vi } from "vitest";
import { partiallyMatches } from "./expect-matchers";
import {
  acceptInvitation,
  getInvitationDetails,
} from "../../src/services/invitation.service";

const FUTURE = new Date(Date.now() + 86_400_000);
const INVITEE_EMAIL = "invitee@company.com";
const PASSWORD = "SecurePassword123!";

const dbMocks = vi.hoisted(() => {
  const prisma = {
    organizationInvitation: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    account: { upsert: vi.fn() },
    userOrganization: { findFirst: vi.fn(), upsert: vi.fn() },
    userBranchRole: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)
  );
  return { prisma };
});

const authMocks = vi.hoisted(() => ({ hashPassword: vi.fn() }));

vi.mock("@suite/db", () => ({
  prisma: dbMocks.prisma,
  assertTenantWriteQuotaAvailable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@suite/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth")>();
  return { ...actual, hashPassword: authMocks.hashPassword };
});

function pendingInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_1",
    token: "hashed_token",
    email: INVITEE_EMAIL,
    organizationId: "org_1",
    roleId: "role_1",
    status: "PENDING",
    expiresAt: FUTURE,
    organization: { id: "org_1", name: "River View", slug: "river-view" },
    role: {
      id: "role_1",
      name: "Staff",
      slug: "staff",
      permissions: [{ permission: { action: "core:organization:read" } }],
    },
    ...overrides,
  };
}

describe("invitation service lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.prisma.userOrganization.findFirst.mockResolvedValue(null);
  });

  it("returns not_found for an unknown token", async () => {
    dbMocks.prisma.organizationInvitation.findUnique.mockResolvedValue(null);
    await expect(getInvitationDetails("missing")).resolves.toEqual({ status: "not_found" });
  });

  it("returns expired for a pending invitation past its expiry", async () => {
    dbMocks.prisma.organizationInvitation.findUnique.mockResolvedValueOnce(
      pendingInvitation({ expiresAt: new Date(Date.now() - 1_000) })
    );
    await expect(getInvitationDetails("expired")).resolves.toEqual({ status: "expired" });
  });

  it("returns the invitation details and branch name for a valid token", async () => {
    dbMocks.prisma.organizationInvitation.findUnique.mockResolvedValueOnce(pendingInvitation());
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce({
      id: "usr_1",
      name: "Invitee",
      accounts: [{ providerId: "credential" }],
      organizations: [{ organizationId: "org_1", status: "ACTIVE" }],
    });
    dbMocks.prisma.userBranchRole.findFirst.mockResolvedValueOnce({
      branch: { name: "North Wing" },
    });

    const result = await getInvitationDetails("valid");

    expect(result.status).toBe("valid");
    if (result.status !== "valid") {
      return;
    }
    expect(result.details).toEqual(
      partiallyMatches({
        email: INVITEE_EMAIL,
        organizationName: "River View",
        roleName: "Staff",
        branchName: "North Wing",
        hasPassword: true,
      })
    );
  });
});

describe("invitation service acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.prisma.userOrganization.findFirst.mockResolvedValue(null);
    authMocks.hashPassword.mockResolvedValue("hashed_password");
  });

  it("requires a password when the invitee has no authenticated session", async () => {
    dbMocks.prisma.organizationInvitation.findUnique.mockResolvedValueOnce(pendingInvitation());
    await expect(
      acceptInvitation({ token: "valid", session: null })
    ).resolves.toEqual({ status: "password_required" });
  });

  it("rejects an invitation issued to a different email than the signed-in session", async () => {
    dbMocks.prisma.organizationInvitation.findUnique.mockResolvedValueOnce(pendingInvitation());
    const result = await acceptInvitation({
      token: "valid",
      session: { userId: "usr_attacker", email: "attacker@evil.com", userName: "Attacker" },
    });

    expect(result).toEqual({
      status: "email_mismatch",
      invitationEmail: INVITEE_EMAIL,
      sessionEmail: "attacker@evil.com",
    });
  });

  it("enrols the invitee and marks the invitation accepted", async () => {
    dbMocks.prisma.organizationInvitation.findUnique.mockResolvedValueOnce(pendingInvitation());
    dbMocks.prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ metadata: {} });
    dbMocks.prisma.user.create.mockResolvedValueOnce({
      id: "usr_new",
      email: INVITEE_EMAIL,
      name: "Invitee",
    });
    dbMocks.prisma.userOrganization.upsert.mockResolvedValueOnce({});
    dbMocks.prisma.userBranchRole.findFirst.mockResolvedValueOnce(null);
    dbMocks.prisma.userBranchRole.create.mockResolvedValueOnce({});
    dbMocks.prisma.organizationInvitation.update.mockResolvedValueOnce({});
    dbMocks.prisma.user.update.mockResolvedValueOnce({});

    const result = await acceptInvitation({
      token: "valid",
      password: PASSWORD,
      name: "Invitee",
      session: null,
    });

    expect(result.status).toBe("accepted");
    expect(authMocks.hashPassword).toHaveBeenCalledWith(PASSWORD);
    expect(dbMocks.prisma.userOrganization.upsert).toHaveBeenCalled();
    expect(dbMocks.prisma.organizationInvitation.update).toHaveBeenCalledWith(
      partiallyMatches({ data: { status: "ACCEPTED" } })
    );
  });
});
