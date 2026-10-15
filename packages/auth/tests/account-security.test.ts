import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  createPasswordResetToken,
  verifyPasswordResetToken,
  completePasswordReset,
  createAccountLinkingTicket,
  verifyAccountLinkingTicket,
  linkOAuthAccountWithPassword,
  PASSWORD_RESET_EXPIRATION_MS,
  ACCOUNT_LINKING_TICKET_EXPIRATION_MS,
  hashPassword,
} from "../src/index.js";

describe("Account Security, Password Reset & Collision Defense (@suite/auth)", () => {
  const secretKey = "super-secret-key-that-is-at-least-32-chars-long!";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Password Reset Token Lifecycle", () => {
    it("generates a 64-character hex token with 15-minute expiration", async () => {
      const captured: {
        data?: { identifier: string; value: string; expiresAt: Date };
        deleted?: { identifier: string };
      } = {};

      const mockPrisma = {
        verification: {
          deleteMany: vi.fn(async ({ where }: { where: { identifier: string } }) => {
            captured.deleted = where;
            return { count: 1 };
          }),
          create: vi.fn(async ({ data }: { data: { identifier: string; value: string; expiresAt: Date } }) => {
            captured.data = data;
            return { id: "ver_1", ...data };
          }),
        },
      } as unknown as PrismaClient;

      const before = Date.now();
      const result = await createPasswordResetToken("User@Company.com", mockPrisma);
      const after = Date.now();

      expect(result.rawToken).toHaveLength(64);
      expect(result.tokenHash).toHaveLength(64);
      expect(captured.deleted).toEqual({ identifier: "reset:user@company.com" });
      expect(captured.data?.identifier).toBe("reset:user@company.com");
      expect(captured.data?.value).toBe(result.tokenHash);

      const diff = result.expiresAt.getTime() - before;
      expect(diff).toBeGreaterThanOrEqual(PASSWORD_RESET_EXPIRATION_MS - 1000);
      expect(diff).toBeLessThanOrEqual(PASSWORD_RESET_EXPIRATION_MS + (after - before) + 1000);
    });

    it("verifies valid token and returns associated email", async () => {
      const rawToken = "a".repeat(64);
      const mockPrisma = {
        verification: {
          findFirst: vi.fn(async () => ({
            id: "ver_1",
            identifier: "reset:alice@example.com",
            expiresAt: new Date(Date.now() + 60000),
          })),
        },
      } as unknown as PrismaClient;

      const result = await verifyPasswordResetToken(rawToken, mockPrisma);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.email).toBe("alice@example.com");
      }
    });

    it("rejects expired token and purges stale record", async () => {
      const rawToken = "b".repeat(64);
      const mockPrisma = {
        verification: {
          findFirst: vi.fn(async () => ({
            id: "ver_old",
            identifier: "reset:bob@example.com",
            expiresAt: new Date(Date.now() - 10000), // expired
          })),
          delete: vi.fn(async () => ({ id: "ver_old" })),
        },
      } as unknown as PrismaClient;

      const result = await verifyPasswordResetToken(rawToken, mockPrisma);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("EXPIRED");
      }
      expect(mockPrisma.verification.delete).toHaveBeenCalledWith({ where: { id: "ver_old" } });
    });
  });

  describe("Global Session Revocation & Password Reset Completion", () => {
    it("rejects password if complexity rules are not met (< 8 chars)", async () => {
      const mockPrisma = {} as unknown as PrismaClient;
      const result = await completePasswordReset({
        token: "some_token",
        newPassword: "short",
        prisma: mockPrisma,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("PASSWORD_COMPLEXITY_FAILED");
      }
    });

    it("updates password hash and REVOKES ALL SESSIONS across all devices globally", async () => {
      const rawToken = "c".repeat(64);
      const existingUser = {
        id: "usr_alice_123",
        email: "alice@company.com",
        accounts: [{ id: "acc_1", providerId: "credential", password: "old_hash" }],
      };

      const deletedSessionsWhere: Array<{ where: { userId: string } }> = [];
      const updatedAccounts: Array<{ where: { id: string }; data: { password: string } }> = [];

      const mockTx = {
        account: {
          update: vi.fn(async (args: { where: { id: string }; data: { password: string } }) => {
            updatedAccounts.push(args);
            return args;
          }),
        },
        verification: {
          deleteMany: vi.fn(async () => ({ count: 1 })),
        },
        session: {
          deleteMany: vi.fn(async (args: { where: { userId: string } }) => {
            deletedSessionsWhere.push(args);
            return { count: 3 }; // revoked 3 active sessions
          }),
        },
      };

      const mockPrisma = {
        verification: {
          findFirst: vi.fn(async () => ({
            id: "ver_99",
            identifier: "reset:alice@company.com",
            expiresAt: new Date(Date.now() + 60000),
          })),
        },
        user: {
          findUnique: vi.fn(async () => existingUser),
        },
        $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      } as unknown as PrismaClient;

      const result = await completePasswordReset({
        token: rawToken,
        newPassword: "NewSecurePassword123!",
        prisma: mockPrisma,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("usr_alice_123");
        expect(result.email).toBe("alice@company.com");
      }

      // 1. Password was updated with an Argon2 hash
      expect(updatedAccounts).toHaveLength(1);
      expect(updatedAccounts[0]?.data.password.startsWith("$argon2id$")).toBe(true);

      // 2. Global revocation: ALL sessions for this user were deleted
      expect(deletedSessionsWhere).toHaveLength(1);
      expect(deletedSessionsWhere[0]?.where.userId).toBe("usr_alice_123");
    }, 15000);
  });

  describe("OAuth Collision Ticket & Account Linking", () => {
    it("creates a cryptographically signed ticket valid for 5 minutes", () => {
      const ticket = createAccountLinkingTicket({
        email: "charlie@enterprise.com",
        providerId: "google",
        accountId: "google_sub_12345",
        name: "Charlie",
        secretKey,
      });

      expect(ticket).toContain(".");
      const decoded = verifyAccountLinkingTicket(ticket, secretKey);
      expect(decoded).not.toBeNull();
      expect(decoded?.email).toBe("charlie@enterprise.com");
      expect(decoded?.providerId).toBe("google");
      expect(decoded?.accountId).toBe("google_sub_12345");
      expect(decoded?.exp).toBeGreaterThan(Date.now() + ACCOUNT_LINKING_TICKET_EXPIRATION_MS - 2000);
    });

    it("rejects tampered or forged tickets", () => {
      const ticket = createAccountLinkingTicket({
        email: "charlie@enterprise.com",
        providerId: "google",
        accountId: "google_sub_12345",
        secretKey,
      });

      // Tamper signature
      const tampered = ticket.slice(0, -4) + "XXXX";
      expect(verifyAccountLinkingTicket(tampered, secretKey)).toBeNull();

      // Wrong secret
      expect(verifyAccountLinkingTicket(ticket, "wrong-secret-key-must-be-at-least-32-chars")).toBeNull();
    });

    it("links OAuth provider upon successful password verification", async () => {
      const currentPasswordHash = await hashPassword("ExistingPassword123!");
      const existingUser = {
        id: "usr_charlie_1",
        email: "charlie@enterprise.com",
        accounts: [
          {
            id: "acc_cred_1",
            providerId: "credential",
            accountId: "charlie@enterprise.com",
            password: currentPasswordHash,
          },
        ],
      };

      const ticket = createAccountLinkingTicket({
        email: "charlie@enterprise.com",
        providerId: "github",
        accountId: "gh_987654",
        secretKey,
      });

      let createdAccount: unknown = null;
      const mockPrisma = {
        user: {
          findUnique: vi.fn(async () => existingUser),
        },
        account: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            createdAccount = data;
            return { id: "acc_gh_1", ...data };
          }),
        },
      } as unknown as PrismaClient;

      // 1. Rejects wrong password
      const badResult = await linkOAuthAccountWithPassword({
        ticket,
        password: "WrongPassword999!",
        prisma: mockPrisma,
        secretKey,
      });
      expect(badResult.success).toBe(false);
      if (!badResult.success) {
        expect(badResult.reason).toBe("INVALID_PASSWORD");
      }

      // 2. Accepts correct password and links provider
      const goodResult = await linkOAuthAccountWithPassword({
        ticket,
        password: "ExistingPassword123!",
        prisma: mockPrisma,
        secretKey,
      });

      expect(goodResult.success).toBe(true);
      expect(createdAccount).toEqual({
        userId: "usr_charlie_1",
        providerId: "github",
        accountId: "gh_987654",
      });
    }, 15000);
  });
});
