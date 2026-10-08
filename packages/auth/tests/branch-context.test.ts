import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  switchActiveBranch,
  getActiveBranchSession,
} from "../src/session/index.js";
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
});
