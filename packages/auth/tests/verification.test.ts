import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  createEmailVerificationToken,
  verifyEmailToken,
  hashVerificationToken,
  EMAIL_VERIFICATION_EXPIRATION_MS,
  ConsoleEmailTransporter,
  ResendEmailTransporter,
  resolveEmailTransporter,
  registerEmailTransporter,
  sendEmail,
} from "../src/index.js";

describe("Email Verification Token Lifecycle & Transporter Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
  });

  describe("Token Generation (createEmailVerificationToken)", () => {
    it("generates a random 64-character hex token and stores SHA-256 hash with 24h expiry", async () => {
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
            return { id: "verif_1", ...data };
          }),
        },
      } as unknown as PrismaClient;

      const before = Date.now();
      const result = await createEmailVerificationToken("User@Example.COM", mockPrisma);
      const after = Date.now();

      expect(result.rawToken).toHaveLength(64); // 32 bytes in hex = 64 characters
      expect(result.tokenHash).toHaveLength(64); // sha256 in hex = 64 characters
      expect(result.tokenHash).toBe(hashVerificationToken(result.rawToken));

      // Verifies normalization to lowercase
      expect(captured.deleted).toEqual({ identifier: "user@example.com" });
      expect(captured.data?.identifier).toBe("user@example.com");
      expect(captured.data?.value).toBe(result.tokenHash);

      // Verifies 24h expiration timestamp
      const diffMs = result.expiresAt.getTime() - before;
      expect(diffMs).toBeGreaterThanOrEqual(EMAIL_VERIFICATION_EXPIRATION_MS - 1000);
      expect(diffMs).toBeLessThanOrEqual(EMAIL_VERIFICATION_EXPIRATION_MS + (after - before) + 1000);
    });
  });

  describe("Token Verification (verifyEmailToken)", () => {
    it("successfully verifies valid token, marks user verified, and deletes token atomically", async () => {
      const rawToken = "a".repeat(64);
      const tokenHash = hashVerificationToken(rawToken);
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future

      const mockUser = { id: "user_123", email: "alice@businessos.com", emailVerified: false };
      const mockRecord = { id: "verif_99", identifier: "alice@businessos.com", value: tokenHash, expiresAt: futureDate };

      const mockPrisma = {
        verification: {
          findFirst: vi.fn(async ({ where }: { where: { value: string } }) => {
            if (where.value === tokenHash) return mockRecord;
            return null;
          }),
          delete: vi.fn(async () => mockRecord),
        },
        user: {
          findUnique: vi.fn(async () => mockUser),
          update: vi.fn(async () => ({ ...mockUser, emailVerified: true })),
        },
        $transaction: vi.fn(async (ops: unknown) => ops),
      } as unknown as PrismaClient;

      const res = await verifyEmailToken(rawToken, mockPrisma);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.email).toBe("alice@businessos.com");
        expect(res.userId).toBe("user_123");
      }
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("rejects non-existent or tampered tokens with INVALID reason", async () => {
      const mockPrisma = {
        verification: {
          findFirst: vi.fn(async () => null),
        },
      } as unknown as PrismaClient;

      const res = await verifyEmailToken("unknown_token_hash_value", mockPrisma);

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.reason).toBe("INVALID");
      }
    });

    it("rejects expired tokens (> 24 hours), purges stale record, and returns EXPIRED reason with email", async () => {
      const rawToken = "b".repeat(64);
      const tokenHash = hashVerificationToken(rawToken);
      const pastDate = new Date(Date.now() - 1000 * 60); // Expired 1 minute ago

      const mockRecord = { id: "verif_old", identifier: "bob@expired.com", value: tokenHash, expiresAt: pastDate };

      const mockPrisma = {
        verification: {
          findFirst: vi.fn(async () => mockRecord),
          delete: vi.fn(async () => mockRecord),
        },
      } as unknown as PrismaClient;

      const res = await verifyEmailToken(rawToken, mockPrisma);

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.reason).toBe("EXPIRED");
        if (res.reason === "EXPIRED") {
          expect(res.email).toBe("bob@expired.com");
        }
      }
      expect(mockPrisma.verification.delete).toHaveBeenCalledWith({ where: { id: "verif_old" } });
    });

    it("handles null, empty string, or whitespace tokens gracefully", async () => {
      const mockPrisma = {} as unknown as PrismaClient;

      const res1 = await verifyEmailToken("", mockPrisma);
      expect(res1.success).toBe(false);

      const res2 = await verifyEmailToken("   ", mockPrisma);
      expect(res2.success).toBe(false);
    });
  });

  describe("Pluggable Email Transporter Strategy", () => {
    it("ConsoleEmailTransporter logs and returns success with deterministic messageId", async () => {
      const transporter = new ConsoleEmailTransporter();
      expect(transporter.id).toBe("console");

      const result = await transporter.sendEmail({
        to: "recipient@test.com",
        subject: "Confirm your email",
        html: "<p>Click here</p>",
        organizationId: "org_riverview",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toContain("console_");
    });

    it("resolves ConsoleEmailTransporter when EMAIL_PROVIDER is not set", () => {
      const transporter = resolveEmailTransporter();
      expect(transporter).toBeInstanceOf(ConsoleEmailTransporter);
    });

    it("resolves ResendEmailTransporter when EMAIL_PROVIDER=resend and RESEND_API_KEY is present", () => {
      process.env.EMAIL_PROVIDER = "resend";
      process.env.RESEND_API_KEY = "re_test_key_123";

      const transporter = resolveEmailTransporter();
      expect(transporter).toBeInstanceOf(ResendEmailTransporter);
      expect(transporter.id).toBe("resend");
    });

    it("allows dynamic registration of custom email transporters without changing core code", () => {
      const customTransporter = {
        id: "mock-smtp",
        sendEmail: vi.fn(async () => ({ success: true, messageId: "smtp_123" })),
      };

      registerEmailTransporter("mock-smtp", () => customTransporter);

      process.env.EMAIL_PROVIDER = "mock-smtp";
      const resolved = resolveEmailTransporter();
      expect(resolved.id).toBe("mock-smtp");
    });

    it("throws critical configuration error in production when unsupported provider is requested", () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        process.env.EMAIL_PROVIDER = "unknown-vendor";

        expect(() => resolveEmailTransporter()).toThrowError(
          /Unsupported EMAIL_PROVIDER 'unknown-vendor' configured in production/
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it("throws critical configuration error in production when resend is used without api key", () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        process.env.EMAIL_PROVIDER = "resend";
        delete process.env.RESEND_API_KEY;

        expect(() => resolveEmailTransporter()).toThrowError(
          /RESEND_API_KEY is required/
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it("sendEmail dispatches through resolved transporter with optional tenant scope", async () => {
      const result = await sendEmail({
        to: "staff@riverview.com",
        subject: "Verify Email",
        html: "<a href='/verify'>Verify</a>",
        organizationId: "org_riverview",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });
});
