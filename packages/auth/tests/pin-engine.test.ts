import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  hashPin,
  verifyPin,
  verifyTerminalPin,
  setTerminalPin,
  clearAllTerminalRateLimits,
  verifyManagerOverridePin,
  verifyOverrideToken,
  setManagerOverridePin,
} from "../src/pin/index.js";
import {
  UnauthorizedError,
  ValidationError,
  RateLimitError,
  ForbiddenError,
} from "../src/errors.js";

describe("High-Security PIN Verification Engine", () => {
  describe("Argon2id PIN Hashing & Verification", () => {
    it("successfully hashes and verifies a 4-digit PIN", async () => {
      const pin = "1234";
      const hashed = await hashPin(pin);

      expect(hashed).toContain("$argon2id$");
      expect(await verifyPin(pin, hashed)).toBe(true);
      expect(await verifyPin("0000", hashed)).toBe(false);
    }, 15000);

    it("successfully hashes and verifies an 8-digit Manager PIN", async () => {
      const pin = "87654321";
      const hashed = await hashPin(pin);

      expect(hashed).toContain("$argon2id$");
      expect(await verifyPin(pin, hashed)).toBe(true);
      expect(await verifyPin("12345678", hashed)).toBe(false);
    }, 15000);

    it("rejects empty or non-string inputs", async () => {
      await expect(hashPin("")).rejects.toThrow();
      expect(await verifyPin("", "$argon2id$...")).toBe(false);
      expect(await verifyPin("1234", "")).toBe(false);
    });
  });

  describe("Terminal Shift-Switch PIN", () => {
    beforeEach(async () => {
      await clearAllTerminalRateLimits();
    });

    it("authenticates a valid shift staff PIN and returns switched user details", async () => {
      const pin = "4567";
      const hashed = await hashPin(pin);

      const mockPrisma = {
        userOrganization: {
          findMany: async () => [
            {
              userId: "user_counter_01",
              organizationId: "org_resort_01",
              status: "ACTIVE",
              terminalPinHash: hashed,
              user: {
                id: "user_counter_01",
                name: "Aman Negi",
                email: "aman@riverview.com",
                branchRoles: [
                  {
                    role: {
                      slug: "front-desk-lead",
                      isSystem: false,
                      permissions: [
                        { permission: { action: "pms:reservations:read" } },
                        { permission: { action: "pms:reservations:create" } },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      } as unknown as PrismaClient;

      const result = await verifyTerminalPin({
        pin: "4567",
        organizationId: "org_resort_01",
        terminalKey: "ipad_counter_1",
        prisma: mockPrisma,
      });

      expect(result.switchedUserId).toBe("user_counter_01");
      expect(result.name).toBe("Aman Negi");
      expect(result.email).toBe("aman@riverview.com");
      expect(result.roles).toEqual(["front-desk-lead"]);
      expect(result.permissions).toContain("pms:reservations:read");
      expect(result.permissions).toContain("pms:reservations:create");
      expect(result.switchedAt).toBeDefined();
    });

    it("rejects invalid PIN formats with ValidationError", async () => {
      const mockPrisma = {} as unknown as PrismaClient;

      await expect(
        verifyTerminalPin({
          pin: "12", // too short (must be 4-6 digits)
          organizationId: "org_01",
          prisma: mockPrisma,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        verifyTerminalPin({
          pin: "12345678", // too long
          organizationId: "org_01",
          prisma: mockPrisma,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        verifyTerminalPin({
          pin: "abcd", // non-numeric
          organizationId: "org_01",
          prisma: mockPrisma,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("locks the terminal after 5 failed attempts with RateLimitError", async () => {
      const mockPrisma = {
        userOrganization: {
          findMany: async () => [],
        },
      } as unknown as PrismaClient;

      const params = {
        pin: "9999",
        organizationId: "org_test",
        terminalKey: "terminal_frontdesk",
        prisma: mockPrisma,
      };

      // 4 failed attempts throw UnauthorizedError
      for (let i = 0; i < 4; i++) {
        await expect(verifyTerminalPin(params)).rejects.toThrow(UnauthorizedError);
      }

      // 5th attempt locks the terminal and throws RateLimitError
      await expect(verifyTerminalPin(params)).rejects.toThrow(RateLimitError);

      // Subsequent attempt is blocked by lockout
      await expect(verifyTerminalPin(params)).rejects.toThrow(RateLimitError);
    });

    it("updates terminal shift PIN in UserOrganization", async () => {
      const captured: {
        updatedData?: { where: { userId_organizationId: { userId: string; organizationId: string } }; data: { terminalPinHash: string } };
      } = {};
      const mockPrisma = {
        userOrganization: {
          update: async (args: { where: { userId_organizationId: { userId: string; organizationId: string } }; data: { terminalPinHash: string } }) => {
            captured.updatedData = args;
            return {};
          },
        },
      } as unknown as PrismaClient;

      const result = await setTerminalPin({
        userId: "user_123",
        organizationId: "org_123",
        newPin: "9876",
        prisma: mockPrisma,
      });

      expect(result.message).toContain("Terminal shift PIN updated");
      expect(captured.updatedData).toBeDefined();
      expect(captured.updatedData?.where.userId_organizationId).toEqual({
        userId: "user_123",
        organizationId: "org_123",
      });
      if (captured.updatedData) {
        expect(await verifyPin("9876", captured.updatedData.data.terminalPinHash)).toBe(true);
      }
    });
  });

  describe("Manager Financial Override PIN & HMAC Minting", () => {
    const SECRET_KEY = "test-hmac-override-secret-key-at-least-32-chars";

    it("verifies manager PIN and mints a 60-second HMAC override token", async () => {
      const managerPin = "889900";
      const hashed = await hashPin(managerPin);

      const mockPrisma = {
        userOrganization: {
          findMany: async () => [
            {
              userId: "user_manager_01",
              organizationId: "org_resort_01",
              status: "ACTIVE",
              user: {
                id: "user_manager_01",
                name: "Sunita Sharma",
                managerPinHash: hashed,
                branchRoles: [
                  {
                    role: {
                      slug: "general-manager",
                      isSystem: true,
                      permissions: [{ permission: { action: "*" } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      } as unknown as PrismaClient;

      const result = await verifyManagerOverridePin({
        managerPin,
        action: "folios:void",
        targetEntityId: "folio_clx123",
        reason: "Customer billing discrepancy corrected by GM",
        organizationId: "org_resort_01",
        secretKey: SECRET_KEY,
        prisma: mockPrisma,
      });

      expect(result.verified).toBe(true);
      expect(result.managerUserId).toBe("user_manager_01");
      expect(result.managerName).toBe("Sunita Sharma");
      expect(result.overrideToken).toBeDefined();
      expect(result.expiresAt).toBeDefined();

      // Now verify the minted override token
      const validated = verifyOverrideToken({
        overrideToken: result.overrideToken,
        expectedAction: "folios:void",
        expectedTargetEntityId: "folio_clx123",
        secretKey: SECRET_KEY,
      });

      expect(validated.valid).toBe(true);
      expect(validated.claims.managerUserId).toBe("user_manager_01");
      expect(validated.claims.action).toBe("folios:void");
      expect(validated.claims.targetEntityId).toBe("folio_clx123");
    });

    it("rejects override token if tampered or cryptographic signature is invalid", async () => {
      const managerPin = "889900";
      const hashed = await hashPin(managerPin);

      const mockPrisma = {
        userOrganization: {
          findMany: async () => [
            {
              userId: "user_manager_01",
              organizationId: "org_resort_01",
              status: "ACTIVE",
              user: {
                id: "user_manager_01",
                name: "Sunita Sharma",
                managerPinHash: hashed,
                branchRoles: [
                  {
                    role: {
                      slug: "general-manager",
                      isSystem: true,
                      permissions: [{ permission: { action: "*" } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      } as unknown as PrismaClient;

      const { overrideToken } = await verifyManagerOverridePin({
        managerPin,
        action: "folios:void",
        targetEntityId: "folio_clx123",
        reason: "Manager override authorized",
        organizationId: "org_resort_01",
        secretKey: SECRET_KEY,
        prisma: mockPrisma,
      });

      // Tampered secret key
      expect(() =>
        verifyOverrideToken({
          overrideToken,
          expectedAction: "folios:void",
          expectedTargetEntityId: "folio_clx123",
          secretKey: "wrong-secret-key",
        })
      ).toThrow(UnauthorizedError);

      // Scoped action mismatch
      expect(() =>
        verifyOverrideToken({
          overrideToken,
          expectedAction: "rates:discount", // Mismatched action
          expectedTargetEntityId: "folio_clx123",
          secretKey: SECRET_KEY,
        })
      ).toThrow(ForbiddenError);

      // Scoped entity mismatch
      expect(() =>
        verifyOverrideToken({
          overrideToken,
          expectedAction: "folios:void",
          expectedTargetEntityId: "folio_other_entity", // Mismatched entity
          secretKey: SECRET_KEY,
        })
      ).toThrow(ForbiddenError);
    });

    it("rejects non-manager users attempting override PIN verification", async () => {
      const pin = "123456";
      const hashed = await hashPin(pin);

      const mockPrisma = {
        userOrganization: {
          findMany: async () => [
            {
              userId: "user_trainee_01",
              organizationId: "org_resort_01",
              status: "ACTIVE",
              user: {
                id: "user_trainee_01",
                name: "Trainee Staff",
                managerPinHash: hashed,
                branchRoles: [
                  {
                    role: {
                      slug: "intern-waiter",
                      isSystem: false,
                      permissions: [{ permission: { action: "pos:orders:read" } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      } as unknown as PrismaClient;

      await expect(
        verifyManagerOverridePin({
          managerPin: pin,
          action: "cashdrawer:open",
          targetEntityId: "drawer_01",
          reason: "Cash audit",
          organizationId: "org_resort_01",
          secretKey: SECRET_KEY,
          prisma: mockPrisma,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("updates manager override PIN in User record", async () => {
      const captured: {
        updatedData?: { where: { id: string }; data: { managerPinHash: string } };
      } = {};
      const mockPrisma = {
        user: {
          update: async (args: { where: { id: string }; data: { managerPinHash: string } }) => {
            captured.updatedData = args;
            return {};
          },
        },
      } as unknown as PrismaClient;

      const result = await setManagerOverridePin({
        userId: "user_gm_01",
        newManagerPin: "778899",
        prisma: mockPrisma,
      });

      expect(result.message).toContain("Manager override PIN updated");
      expect(captured.updatedData).toBeDefined();
      expect(captured.updatedData?.where.id).toBe("user_gm_01");
      if (captured.updatedData) {
        expect(await verifyPin("778899", captured.updatedData.data.managerPinHash)).toBe(true);
      }
    });
  });
});
