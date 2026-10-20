import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@suite/db";
import { PERMISSIONS } from "@suite/core";
import {
  updateOrganizationRole,
  deleteOrganizationRole,
} from "../src/services/roles.service";
import {
  inviteOrganizationMember,
  isAdministrativeRole,
  countOtherActiveAdmins,
  SafeguardViolationError,
  ConflictError,
  NotFoundError,
} from "../src/services/members.service";

vi.mock("@suite/db", () => {
  const mockPrisma = {
    role: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    userOrganization: {
      count: vi.fn(),
    },
    organizationInvitation: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    userBranchRole: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    branch: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => (typeof cb === "function" ? cb(mockPrisma) : cb)),
  };
  return { prisma: mockPrisma };
});

describe("Role Governance, Atomic Reassignment & Pure Capability RBAC (Issue #169)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Role Governance: Global Role Protection (Issue 39)", () => {
    it("strictly forbids modifying global platform roles where organizationId is null", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_global_custom",
        name: "Global Custom Role",
        slug: "global-custom",
        isSystem: false,
        organizationId: null, // Global platform role
        branchAssignments: [],
      } as never);

      await expect(
        updateOrganizationRole("org_tenant_1", "role_global_custom", {
          name: "Attacked Global Role",
        })
      ).rejects.toThrow(SafeguardViolationError);
    });

    it("strictly forbids deleting global platform roles where organizationId is null", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_global_custom",
        name: "Global Custom Role",
        slug: "global-custom",
        isSystem: false,
        organizationId: null, // Global platform role
      } as never);

      await expect(
        deleteOrganizationRole("org_tenant_1", "role_global_custom")
      ).rejects.toThrow(SafeguardViolationError);
    });

    it("prevents a tenant from modifying roles belonging to a different organization", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_other_org",
        name: "Other Tenant Role",
        slug: "other-role",
        isSystem: false,
        organizationId: "org_other_tenant",
        branchAssignments: [],
      } as never);

      await expect(
        updateOrganizationRole("org_tenant_1", "role_other_org", {
          name: "Attempted Hijack",
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ConflictError when attempting to delete a role currently assigned to team members", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_active_1",
        name: "Active Role",
        slug: "active-role",
        isSystem: false,
        organizationId: "org_tenant_1",
      } as never);

      vi.mocked(prisma.userBranchRole.count).mockResolvedValueOnce(3);

      await expect(
        deleteOrganizationRole("org_tenant_1", "role_active_1")
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("Atomic Reassignment & Invitation Transactions (Issue 08)", () => {
    it("executes member invitation and role reassignment inside an atomic prisma.$transaction", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_existing_1",
        name: "Existing Member",
        email: "member@example.com",
        organizations: [],
      } as never);

      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_custom_1",
        name: "Custom Role",
        slug: "custom-role",
        permissions: [],
      } as never);

      vi.mocked(prisma.organizationInvitation.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.organizationInvitation.deleteMany).mockResolvedValueOnce({ count: 0 });
      vi.mocked(prisma.organizationInvitation.create).mockResolvedValueOnce({
        id: "inv_123",
        email: "member@example.com",
        roleId: "role_custom_1",
        token: "tok_secure_123",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
        createdAt: new Date(),
        role: {
          id: "role_custom_1",
          name: "Custom Role",
          slug: "custom-role",
          permissions: [],
        },
      } as never);

      const result = await inviteOrganizationMember("org_tenant_1", "usr_admin_1", {
        email: "member@example.com",
        roleId: "role_custom_1",
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.invitation.email).toBe("member@example.com");
      expect(result.inviteUrl).toContain("/invite/");
    });
  });

  describe("Pure Capability-Driven RBAC (Issues 31 & 49)", () => {
    it("identifies administrative capability via wildcard permission (*)", () => {
      const role = {
        slug: "custom-operator-title", // Arbitrary slug!
        permissions: [{ permission: { action: PERMISSIONS.WILDCARD } }],
      };
      expect(isAdministrativeRole(role)).toBe(true);
    });

    it("identifies administrative capability via core domain wildcard (core:*)", () => {
      const role = {
        slug: "custom-finance-auditor",
        permissions: [{ permission: { action: PERMISSIONS.CORE.ALL } }],
      };
      expect(isAdministrativeRole(role)).toBe(true);
    });

    it("identifies administrative capability via users manage permission (core:users:manage)", () => {
      const role = {
        slug: "hr-director",
        permissions: [{ permission: { action: PERMISSIONS.CORE.USERS_MANAGE } }],
      };
      expect(isAdministrativeRole(role)).toBe(true);
    });

    it("denies administrative capability for roles with only granular non-admin permissions", () => {
      const role = {
        slug: "website-editor",
        permissions: [
          { permission: { action: "cms:sites:read" } },
          { permission: { action: "cms:pages:write" } },
        ],
      };
      expect(isAdministrativeRole(role)).toBe(false);
    });

    it("evaluates other active admins using capability permissions in count query", async () => {
      vi.mocked(prisma.userOrganization.count).mockResolvedValueOnce(2);

      const count = await countOtherActiveAdmins("org_tenant_1", "uo_current_1");
      expect(count).toBe(2);
      expect(prisma.userOrganization.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org_tenant_1",
            status: "ACTIVE",
            id: { not: "uo_current_1" },
          }),
        })
      );
    });
  });
});
