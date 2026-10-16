import React from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import ResetPasswordPage from "../src/app/(auth)/reset-password/page";
import LinkAccountPage from "../src/app/(auth)/link-account/page";
import ForgotPasswordPage from "../src/app/(auth)/forgot-password/page";
import { POST as forgotPasswordRoute } from "../src/app/api/auth/forgot-password/route";
import { POST as resetPasswordRoute } from "../src/app/api/auth/reset-password/route";
import {
  GET as linkAccountGetRoute,
  POST as linkAccountPostRoute,
} from "../src/app/api/auth/link-account/route";
import {
  createAccountLinkingTicket,
  hashPassword,
  SESSION_COOKIE_NAME,
} from "@suite/auth";

let mockSearchParams = new URLSearchParams();

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/reset-password",
}));

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userOrganization: {
      findFirst: vi.fn(),
    },
    verification: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: unknown }) => ({ id: "audit_1", ...data as object })),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});

// Mock @suite/redis
vi.mock("@suite/redis", () => {
  const mockRedis = {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => 3600),
  };
  return { redis: mockRedis };
});

// Mock email transporter
vi.mock("@suite/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => ({ success: true, messageId: "msg_test" })),
  };
});

import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import { sendEmail } from "@suite/auth";

describe("Account Security, Password Reset & Collision Defense (@suite/dashboard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    process.env.BETTER_AUTH_SECRET = "super-secret-key-that-is-at-least-32-chars-long!";
  });

  describe("UI Components Presentation & Envelope Encapsulation", () => {
    it("renders ForgotPasswordPage with AuthCard and email recovery input", () => {
      const html = renderToString(<ForgotPasswordPage />);
      expect(html).toContain("Reset your password");
      expect(html).toContain("Enter your email address to reset your password");
      expect(html).toContain("Email Address");
      expect(html).toContain("Send reset link");
      expect(html).toContain("Sign in");
    });

    it("renders ResetPasswordPage with AuthCard and invalid link state when token is missing", () => {
      mockSearchParams = new URLSearchParams();
      const html = renderToString(<ResetPasswordPage />);
      expect(html).toContain("Invalid Reset Link");
      expect(html).toContain("Missing verification token");
      expect(html).toContain("Request new reset link");
    });

    it("renders ResetPasswordPage with fields for New and Confirm Password when token is provided", () => {
      mockSearchParams = new URLSearchParams("token=valid_test_token");
      const html = renderToString(<ResetPasswordPage />);
      expect(html).toContain("Set new password");
      expect(html).toContain("New Password");
      expect(html).toContain("Confirm New Password");
      expect(html).toContain("Reset Password");
      expect(html).toContain("Sign in");
    });

    it("renders LinkAccountPage with missing challenge message when ticket is missing", () => {
      mockSearchParams = new URLSearchParams();
      const html = renderToString(<LinkAccountPage />);
      expect(html).toContain("Account Linking");
      expect(html).toContain("Missing Linking Challenge");
      expect(html).toContain("Return to Sign in");
    });

    it("renders LinkAccountPage with password prompt when ticket is present", () => {
      mockSearchParams = new URLSearchParams("ticket=valid_test_ticket.sig");
      const html = renderToString(<LinkAccountPage />);
      expect(html).toContain("Link your account");
      expect(html).toContain("Existing Password");
      expect(html).toContain("Link OAuth Provider Account");
    });
  });

  describe("API: POST /api/auth/forgot-password", () => {
    it("returns 400 Bad Request when email format is invalid", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email" }),
      });

      const res = await forgotPasswordRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_FAILED");
    });

    it("enforces rate limit of max 5 requests per hour (HTTP 429)", async () => {
      (redis.incr as unknown as Mock).mockResolvedValueOnce(6);
      (redis.ttl as unknown as Mock).mockResolvedValueOnce(1800);

      const req = new NextRequest("http://localhost:3001/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "operator@enterprise.com" }),
      });

      const res = await forgotPasswordRoute(req);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("1800");
      const data = await res.json();
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("dispatches single-use reset token and email when user exists", async () => {
      (redis.incr as unknown as Mock).mockResolvedValueOnce(1);
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_sec_1",
        email: "operator@enterprise.com",
      });

      const req = new NextRequest("http://localhost:3001/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "operator@enterprise.com" }),
      });

      const res = await forgotPasswordRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify token creation and email dispatch
      expect(prisma.verification.create).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "operator@enterprise.com",
          subject: expect.stringContaining("Reset your password"),
        })
      );
    });

    it("returns opaque success without error when user does not exist (prevents enumeration)", async () => {
      (redis.incr as unknown as Mock).mockResolvedValueOnce(1);
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3001/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "unknown@enterprise.com" }),
      });

      const res = await forgotPasswordRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("API: POST /api/auth/reset-password", () => {
    it("returns 400 Bad Request when passwords do not match", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: "valid_token",
          newPassword: "SecurePassword1!",
          confirmPassword: "DifferentPassword2@",
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_FAILED");
    });

    it("returns 400 Bad Request when password fails complexity requirements", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: "valid_token",
          newPassword: "short",
          confirmPassword: "short",
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_FAILED");
    });

    it("returns 400 when token is invalid or expired", async () => {
      (prisma.verification.findFirst as unknown as Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3001/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: "non_existent_token",
          newPassword: "SecurePassword1!",
          confirmPassword: "SecurePassword1!",
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_TOKEN");
    });

    it("successfully resets password, updates hash, revokes all sessions globally, and sets cookie", async () => {
      const userEmail = "operator@enterprise.com";
      const userId = "usr_123";

      // Mock verification record
      (prisma.verification.findFirst as unknown as Mock).mockResolvedValueOnce({
        id: "verif_reset_1",
        identifier: `reset:${userEmail}`,
        value: "hashed_val",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes remaining
      });

      // Mock user with credential account
      (prisma.user.findUnique as unknown as Mock).mockImplementation((args: { where: { id?: string; email?: string } }) => {
        if (args.where.email === userEmail || args.where.id === userId) {
          return Promise.resolve({
            id: userId,
            email: userEmail,
            name: "Enterprise Operator",
            metadata: { onboarding_status: "COMPLETED" },
            accounts: [
              {
                id: "acc_cred_1",
                providerId: "credential",
                accountId: userEmail,
                password: "old_hashed_password",
              },
            ],
          });
        }
        return Promise.resolve(null);
      });

      // Mock user organization
      (prisma.userOrganization.findFirst as unknown as Mock).mockResolvedValueOnce({
        userId,
        organizationId: "org_alpha",
        status: "ACTIVE",
        organization: { id: "org_alpha", name: "Alpha Corp", slug: "alpha-corp" },
      });

      const req = new NextRequest("http://localhost:3001/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: "valid_secret_reset_token",
          newPassword: "BrandNewSecurePassword99#",
          confirmPassword: "BrandNewSecurePassword99#",
        }),
      });

      const res = await resetPasswordRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // CRITICAL SECURITY ASSERTION: All active sessions globally revoked across all devices
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });

      // Token consumed
      expect(prisma.verification.deleteMany).toHaveBeenCalled();

      // Fresh session cookie set for current client
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
    });
  });

  describe("API: /api/auth/link-account (OAuth Collision Defense)", () => {
    it("GET: returns 400 when ticket is missing", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/link-account");
      const res = await linkAccountGetRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_TICKET");
    });

    it("GET: validates and decodes valid signed linking ticket", async () => {
      const ticket = createAccountLinkingTicket({
        email: "alice@domain.com",
        providerId: "google",
        accountId: "google_12345",
        secretKey: "super-secret-key-that-is-at-least-32-chars-long!",
      });

      const req = new NextRequest(`http://localhost:3001/api/auth/link-account?ticket=${ticket}`);
      const res = await linkAccountGetRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.email).toBe("alice@domain.com");
      expect(data.providerId).toBe("google");
    });

    it("POST: returns 401 when password is wrong during account linking challenge", async () => {
      const ticket = createAccountLinkingTicket({
        email: "alice@domain.com",
        providerId: "github",
        accountId: "gh_98765",
        secretKey: "super-secret-key-that-is-at-least-32-chars-long!",
      });

      const correctHash = await hashPassword("RightPassword123!");

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "usr_alice",
        email: "alice@domain.com",
        accounts: [
          {
            id: "acc_cred_alice",
            providerId: "credential",
            password: correctHash,
          },
        ],
      });

      const req = new NextRequest("http://localhost:3001/api/auth/link-account", {
        method: "POST",
        body: JSON.stringify({
          ticket,
          password: "WrongPassword999!",
        }),
      });

      const res = await linkAccountPostRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("INVALID_CREDENTIALS");
    });

    it("POST: links provider account and establishes session upon correct password", async () => {
      const ticket = createAccountLinkingTicket({
        email: "alice@domain.com",
        providerId: "github",
        accountId: "gh_98765",
        secretKey: "super-secret-key-that-is-at-least-32-chars-long!",
      });

      const correctHash = await hashPassword("RightPassword123!");

      (prisma.user.findUnique as unknown as Mock).mockImplementation((_args: { where: { id?: string; email?: string } }) => {
        return Promise.resolve({
          id: "usr_alice",
          email: "alice@domain.com",
          name: "Alice Engineer",
          accounts: [
            {
              id: "acc_cred_alice",
              providerId: "credential",
              password: correctHash,
            },
          ],
          organizations: [
            {
              organizationId: "org_alice",
              organization: { id: "org_alice", name: "Alice Workspace" },
            },
          ],
          branchRoles: [
            {
              role: { name: "owner", permissions: [] },
              branch: null,
            },
          ],
        });
      });

      const req = new NextRequest("http://localhost:3001/api/auth/link-account", {
        method: "POST",
        body: JSON.stringify({
          ticket,
          password: "RightPassword123!",
        }),
      });

      const res = await linkAccountPostRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Account linked in database
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: "usr_alice",
          providerId: "github",
          accountId: "gh_98765",
        },
      });

      // Session established with cookie
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
    });
  });
});
