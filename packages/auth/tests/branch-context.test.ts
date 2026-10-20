import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  switchActiveBranch,
  getActiveBranchSession,
  listUserTenants,
  switchActiveTenant,
} from "../src/session/index.js";
import {
  getUserRolePermissions,
  invalidateUserPermissionsCache,
} from "../src/index.js";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "../src/errors.js";

describe("Active Branch Session Context Engine", () => {
  const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // +1 day
  const expiredDate = new Date(Date.now() - 1000 * 60); // -1 minute

  it("switches branch for a user assigned directly to the branch", async () => {
    const captured: {
      sessionUpdateCall?: { where: { id: string }; data: { activeBranchId: string; activeOrganizationId: string } };
    } = {};

    const mockPrisma = {
      session: {
        findUnique: async () => ({
          id: "session_01",
          userId: "user_reception_01",
          token: "valid_session_token",
          expiresAt: futureDate,
          activeOrganizationId: "org_resort_01",
          activeBranchId: "branch_old_01",
          user: {
            id: "user_reception_01",
            email: "reception@riverview.com",
            name: "Rohit Reception",
          },
        }),
        update: async (args: { where: { id: string }; data: { activeBranchId: string; activeOrganizationId: string } }) => {
          captured.sessionUpdateCall = args;
          return {};
        },
      },
      branch: {
        findUnique: async () => ({
          id: "branch_cafe_02",
          organizationId: "org_resort_01",
          name: "River View Riverside Cafe",
          code: "RV-CAFE",
          type: "restaurant",
          timezone: "Asia/Kolkata",
          currency: "INR",
          locale: "en",
        }),
      },
      userOrganization: {
        findUnique: async () => ({
          userId: "user_reception_01",
          organizationId: "org_resort_01",
          status: "ACTIVE",
        }),
      },
      userBranchRole: {
        findMany: async () => [
          {
            branchId: "branch_cafe_02",
            role: {
              slug: "cafe-cashier",
              isSystem: false,
              permissions: [
                { permission: { action: "pos:orders:create" } },
                { permission: { action: "pos:bills:settle" } },
              ],
            },
          },
        ],
      },
    } as unknown as PrismaClient;

    const result = await switchActiveBranch({
      sessionToken: "valid_session_token",
      branchId: "branch_cafe_02",
      prisma: mockPrisma,
    });

    expect(result.success).toBe(true);
    expect(result.data.activeOrganizationId).toBe("org_resort_01");
    expect(result.data.activeBranchId).toBe("branch_cafe_02");
    expect(result.data.branch.name).toBe("River View Riverside Cafe");
    expect(result.data.branch.code).toBe("RV-CAFE");
    expect(result.data.effectiveRoles).toEqual(["cafe-cashier"]);
    expect(result.data.permissions).toContain("pos:orders:create");
    expect(result.data.permissions).toContain("pos:bills:settle");

    expect(captured.sessionUpdateCall).toBeDefined();
    expect(captured.sessionUpdateCall?.where.id).toBe("session_01");
    expect(captured.sessionUpdateCall?.data.activeBranchId).toBe("branch_cafe_02");
    expect(captured.sessionUpdateCall?.data.activeOrganizationId).toBe("org_resort_01");
  });

  it("authorizes organization-wide owners (branchId = null) to switch to any branch", async () => {
    const mockPrisma = {
      session: {
        findUnique: async () => ({
          id: "session_owner_01",
          userId: "user_owner_01",
          token: "owner_token",
          expiresAt: futureDate,
          activeOrganizationId: "org_resort_01",
          user: { id: "user_owner_01", email: "owner@riverview.com", name: "Master Owner" },
        }),
        update: async () => ({}),
      },
      branch: {
        findUnique: async () => ({
          id: "branch_spa_03",
          organizationId: "org_resort_01",
          name: "River View Wellness Spa",
          code: "RV-SPA",
          type: "wellness",
          timezone: "Asia/Kolkata",
          currency: "INR",
          locale: "en",
        }),
      },
      userOrganization: {
        findUnique: async () => ({
          userId: "user_owner_01",
          organizationId: "org_resort_01",
          status: "ACTIVE",
        }),
      },
      userBranchRole: {
        findMany: async () => [
          {
            branchId: null, // HQ Master Role
            role: {
              slug: "org-owner",
              isSystem: true,
              permissions: [{ permission: { action: "*" } }],
            },
          },
        ],
      },
    } as unknown as PrismaClient;

    const result = await switchActiveBranch({
      sessionToken: "owner_token",
      branchId: "branch_spa_03",
      prisma: mockPrisma,
    });

    expect(result.success).toBe(true);
    expect(result.data.effectiveRoles).toContain("org-owner");
    expect(result.data.permissions).toContain("*");
  });

  it("rejects expired session with UnauthorizedError", async () => {
    const mockPrisma = {
      session: {
        findUnique: async () => ({
          id: "session_expired",
          userId: "user_01",
          token: "expired_token",
          expiresAt: expiredDate,
        }),
      },
    } as unknown as PrismaClient;

    await expect(
      switchActiveBranch({
        sessionToken: "expired_token",
        branchId: "branch_01",
        prisma: mockPrisma,
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects non-existent branch with NotFoundError", async () => {
    const mockPrisma = {
      session: {
        findUnique: async () => ({
          id: "session_01",
          userId: "user_01",
          token: "valid_token",
          expiresAt: futureDate,
        }),
      },
      branch: {
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;

    await expect(
      switchActiveBranch({
        sessionToken: "valid_token",
        branchId: "branch_nonexistent",
        prisma: mockPrisma,
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects users not assigned to the branch with ForbiddenError", async () => {
    const mockPrisma = {
      session: {
        findUnique: async () => ({
          id: "session_01",
          userId: "user_outsider",
          token: "valid_token",
          expiresAt: futureDate,
        }),
      },
      branch: {
        findUnique: async () => ({
          id: "branch_secure_01",
          organizationId: "org_01",
        }),
      },
      userOrganization: {
        findUnique: async () => ({
          userId: "user_outsider",
          organizationId: "org_01",
          status: "ACTIVE",
        }),
      },
      userBranchRole: {
        findMany: async () => [], // No roles for this branch!
      },
    } as unknown as PrismaClient;

    await expect(
      switchActiveBranch({
        sessionToken: "valid_token",
        branchId: "branch_secure_01",
        prisma: mockPrisma,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("retrieves active branch session details using getActiveBranchSession", async () => {
    const mockPrisma = {
      session: {
        findUnique: async () => ({
          id: "session_active_01",
          userId: "user_01",
          token: "active_token",
          expiresAt: futureDate,
          activeOrganizationId: "org_01",
          activeBranchId: "branch_01",
          user: {
            id: "user_01",
            email: "staff@resort.com",
            name: "Staff Name",
          },
        }),
      },
      branch: {
        findUnique: async () => ({
          id: "branch_01",
          organizationId: "org_01",
          name: "Main Resort",
          code: "RES-01",
          type: "lodging",
          timezone: "Asia/Kolkata",
          currency: "INR",
          locale: "en",
        }),
      },
      userBranchRole: {
        findMany: async () => [
          {
            role: {
              slug: "front-desk",
              isSystem: false,
              permissions: [{ permission: { action: "pms:reservations:read" } }],
            },
          },
        ],
      },
    } as unknown as PrismaClient;

    const details = await getActiveBranchSession("active_token", mockPrisma);

    expect(details.sessionId).toBe("session_active_01");
    expect(details.userId).toBe("user_01");
    expect(details.email).toBe("staff@resort.com");
    expect(details.activeBranchId).toBe("branch_01");
    expect(details.branch?.code).toBe("RES-01");
    expect(details.effectiveRoles).toContain("front-desk");
    expect(details.permissions).toContain("pms:reservations:read");
  });

  describe("Multi-Tenancy Disambiguation & Context Switching", () => {
    it("lists all active tenant memberships with roles, names, and slugs", async () => {
      const mockPrisma = {
        userOrganization: {
          findMany: async () => [
            {
              userId: "user_multi_01",
              organizationId: "org_riverview",
              organization: {
                id: "org_riverview",
                name: "River View Homestay",
                slug: "riverview",
                metadata: { logoUrl: "https://cdn.example.com/riverview.png" },
              },
            },
            {
              userId: "user_multi_01",
              organizationId: "org_alpine",
              organization: {
                id: "org_alpine",
                name: "Alpine Cafe",
                slug: "alpine-cafe",
                metadata: {},
              },
            },
          ],
        },
        userBranchRole: {
          findFirst: async ({ where }: { where: { organizationId: string } }) => {
            if (where.organizationId === "org_riverview") {
              return { role: { name: "Owner", slug: "owner" } };
            }
            return { role: { name: "Manager", slug: "manager" } };
          },
        },
      } as unknown as PrismaClient;

      const tenants = await listUserTenants("user_multi_01", mockPrisma);

      expect(tenants).toHaveLength(2);
      expect(tenants[0]?.name).toBe("River View Homestay");
      expect(tenants[0]?.role).toBe("Owner");
      expect(tenants[0]?.logoUrl).toBe("https://cdn.example.com/riverview.png");
      expect(tenants[1]?.name).toBe("Alpine Cafe");
      expect(tenants[1]?.role).toBe("Manager");
      expect(tenants[1]?.logoUrl).toBeNull();
    });

    it("batches userBranchRole lookup via findMany avoiding N+1 loops (Issue 16)", async () => {
      let findManyCalls = 0;
      let findFirstCalls = 0;

      const mockPrisma = {
        userOrganization: {
          findMany: async () => [
            {
              userId: "user_multi_02",
              organizationId: "org_1",
              organization: { id: "org_1", name: "Org 1", slug: "org-1", metadata: {} },
            },
            {
              userId: "user_multi_02",
              organizationId: "org_2",
              organization: { id: "org_2", name: "Org 2", slug: "org-2", metadata: {} },
            },
            {
              userId: "user_multi_02",
              organizationId: "org_3",
              organization: { id: "org_3", name: "Org 3", slug: "org-3", metadata: {} },
            },
          ],
        },
        userBranchRole: {
          findMany: async () => {
            findManyCalls++;
            return [
              { organizationId: "org_1", role: { name: "Admin", slug: "admin" } },
              { organizationId: "org_2", role: { name: "Staff", slug: "staff" } },
              { organizationId: "org_3", role: { name: "Lead", slug: "lead" } },
            ];
          },
          findFirst: async () => {
            findFirstCalls++;
            return null;
          },
        },
      } as unknown as PrismaClient;

      const tenants = await listUserTenants("user_multi_02", mockPrisma);

      expect(tenants).toHaveLength(3);
      expect(findManyCalls).toBe(1);
      expect(findFirstCalls).toBe(0);
      expect(tenants[0]?.role).toBe("Admin");
      expect(tenants[1]?.role).toBe("Staff");
      expect(tenants[2]?.role).toBe("Lead");
    });

    it("switches active tenant context and extracts branch and dynamic permissions", async () => {
      const mockPrisma = {
        userOrganization: {
          findUnique: async () => ({
            userId: "user_multi_01",
            organizationId: "org_alpine",
            status: "ACTIVE",
            organization: {
              id: "org_alpine",
              name: "Alpine Cafe",
              slug: "alpine-cafe",
              branches: [{ id: "branch_main", name: "Main Dining Hall" }],
            },
          }),
        },
        userBranchRole: {
          findMany: async () => [
            {
              branchId: "branch_main",
              branch: { id: "branch_main", name: "Main Dining Hall" },
              role: {
                name: "Manager",
                slug: "manager",
                permissions: [
                  { permission: { action: "pos:orders:create" } },
                  { permission: { action: "pos:reports:read" } },
                ],
              },
            },
          ],
        },
      } as unknown as PrismaClient;

      const result = await switchActiveTenant({
        userId: "user_multi_01",
        targetOrganizationId: "org_alpine",
        prisma: mockPrisma,
      });

      expect(result.organizationId).toBe("org_alpine");
      expect(result.organizationName).toBe("Alpine Cafe");
      expect(result.organizationSlug).toBe("alpine-cafe");
      expect(result.activeBranchId).toBe("branch_main");
      expect(result.activeBranchName).toBe("Main Dining Hall");
      expect(result.role).toBe("Manager");
      expect(result.permissions).toContain("pos:orders:create");
      expect(result.permissions).toContain("pos:reports:read");
    });

    it("rejects tenant switch with ForbiddenError if user is not an active member", async () => {
      const mockPrisma = {
        userOrganization: {
          findUnique: async () => null,
        },
      } as unknown as PrismaClient;

      await expect(
        switchActiveTenant({
          userId: "user_multi_01",
          targetOrganizationId: "org_foreign",
          prisma: mockPrisma,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("resolves role permissions with Redis cache-aside (Issue 53)", async () => {
      let dbQueryCount = 0;
      const mockPrisma = {
        userBranchRole: {
          findMany: async () => {
            dbQueryCount++;
            return [
              {
                branchId: "branch_spa",
                role: {
                  permissions: [
                    { permission: { action: "spa:services:book" } },
                    { permission: { action: "spa:services:read" } },
                  ],
                },
              },
            ];
          },
        },
      } as unknown as PrismaClient;

      const userId = "user_spa_therapist_01";
      const orgId = "org_wellness_resort";
      const branchId = "branch_spa";

      // Invalidate any prior cache
      await invalidateUserPermissionsCache(orgId, userId);

      // First call executes DB query
      const perms1 = await getUserRolePermissions(mockPrisma, userId, orgId, branchId);
      expect(perms1).toEqual(["spa:services:book", "spa:services:read"]);
      expect(dbQueryCount).toBe(1);

      // Second call serves from Redis cache without querying DB
      const perms2 = await getUserRolePermissions(mockPrisma, userId, orgId, branchId);
      expect(perms2).toEqual(["spa:services:book", "spa:services:read"]);
      expect(dbQueryCount).toBe(1);

      // Invalidate and verify DB is queried again
      await invalidateUserPermissionsCache(orgId, userId);
      const perms3 = await getUserRolePermissions(mockPrisma, userId, orgId, branchId);
      expect(perms3).toEqual(["spa:services:book", "spa:services:read"]);
      expect(dbQueryCount).toBe(2);
    });
  });
});

