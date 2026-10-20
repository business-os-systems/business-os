import React from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { UnverifiedEmailBanner } from "../src/components/layout/unverified-email-banner";
import { VerifiedSuccessBannerContent } from "../src/components/layout/verified-success-banner";
import { InstallGateDialog } from "../src/components/marketplace/install-gate-dialog";
import VerifyExpiredPage from "../src/app/(auth)/verify-expired/page";
import { POST as requestVerifyEmailRoute } from "../src/app/api/auth/verify-email/request/route";
import {
  GET as confirmVerifyEmailGetRoute,
  POST as confirmVerifyEmailPostRoute,
} from "../src/app/api/auth/verify-email/confirm/route";
import { POST as installAppRoute } from "../src/app/api/v1/apps/[id]/install/route";
import {
  signSessionToken,
  encodeSessionPayload,
  SESSION_COOKIE_NAME,
} from "@suite/auth";
import { PERMISSIONS } from "@suite/core";

let mockSearchParams = new URLSearchParams();

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/dashboard",
}));

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    verification: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    installedApp: {
      upsert: vi.fn(),
    },
    userBranchRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown) => ops),
  };
  return { prisma: mockPrisma };
});

// Mock @suite/redis
vi.mock("@suite/redis", () => {
  const mockRedis = {
    incr: vi.fn(async (_key?: string) => 1),
    expire: vi.fn(async (_key?: string, _sec?: number) => 1),
    ttl: vi.fn(async (_key?: string) => 3600),
  };
  return {
    redis: mockRedis,
    checkRateLimit: vi.fn(async (rules: Array<{ key: string; max: number; windowSeconds: number }>) => {
      for (const rule of rules) {
        if (!rule.key || rule.max <= 0) continue;
        const currentCount = await mockRedis.incr(rule.key);
        if (currentCount > rule.max) {
          const ttl = await mockRedis.ttl(rule.key);
          return {
            allowed: false,
            retryAfter: ttl > 0 ? ttl : rule.windowSeconds,
            detail: `Rate limit exceeded. Maximum ${rule.max} verification emails allowed per hour.`,
            violatedRuleKey: rule.key,
          };
        }
      }
      return { allowed: true, retryAfter: 0 };
    }),
  };
});

import { prisma } from "@suite/db";
import { redis } from "@suite/redis";

describe("Deferred Email Verification & Marketplace Installation Gate (@suite/dashboard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    process.env.BETTER_AUTH_SECRET = "super-secret-key-that-is-at-least-32-chars-long!";
  });

  describe("Component: UnverifiedEmailBanner", () => {
    it("renders warning banner with user email and resend button", () => {
      const html = renderToString(<UnverifiedEmailBanner email="john@company.com" />);
      expect(html).toContain("john@company.com");
      expect(html).toContain("is unverified");
      expect(html).toContain("Application installation is restricted until verified");
      expect(html).toContain("Resend verification email");
    });
  });

  describe("Component: VerifiedSuccessBanner", () => {
    it("renders success notification when verified=true in searchParams", () => {
      mockSearchParams = new URLSearchParams("verified=true");
      const html = renderToString(<VerifiedSuccessBannerContent />);
      expect(html).toContain("Email verified successfully");
      expect(html).toContain("Full workspace access and application installations are now unlocked");
    });

    it("renders nothing when verified is absent", () => {
      mockSearchParams = new URLSearchParams();
      const html = renderToString(<VerifiedSuccessBannerContent />);
      expect(html).toBe("");
    });
  });

  describe("Component: InstallGateDialog", () => {
    it("renders Level 3 modal-sm dialog when open", () => {
      const html = renderToString(
        <InstallGateDialog isOpen={true} onClose={vi.fn()} userEmail="john@company.com" />
      );
      expect(html).toContain("Email verification required");
      expect(html).toContain("You must verify your email address before installing new applications");
      expect(html).toContain("Resend verification email");
      expect(html).toContain("Cancel");
    });

    it("renders nothing when closed", () => {
      const html = renderToString(
        <InstallGateDialog isOpen={false} onClose={vi.fn()} userEmail="john@company.com" />
      );
      expect(html).toBe("");
    });
  });

  describe("Component: VerifyExpiredPage", () => {
    it("renders AuthCard envelope with Link Expired header", () => {
      const html = renderToString(<VerifyExpiredPage />);
      expect(html).toContain("Link Expired");
      expect(html).toContain("Your email verification link has expired");
      expect(html).toContain("Resend Verification Email");
      expect(html).toContain("Account Email");
    });
  });

  describe("API: POST /api/auth/verify-email/request", () => {
    it("returns 400 when email is not provided and user is not authenticated", async () => {
      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/request", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await requestVerifyEmailRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_FAILED");
    });

    it("dispatches verification token when valid email is provided", async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_1",
        email: "alex@enterprise.com",
        emailVerified: false,
      });

      (prisma.verification.create as unknown as Mock).mockResolvedValueOnce({
        id: "verif_1",
        identifier: "alex@enterprise.com",
        value: "token_hash",
        expiresAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/request", {
        method: "POST",
        body: JSON.stringify({ email: "alex@enterprise.com" }),
      });

      const res = await requestVerifyEmailRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Verification link dispatched");
    });

    it("enforces rate limit of max 5 requests per hour (HTTP 429)", async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_1",
        email: "spammer@enterprise.com",
        emailVerified: false,
      });

      (redis.incr as unknown as Mock).mockResolvedValueOnce(6); // 6th attempt in window
      (redis.ttl as unknown as Mock).mockResolvedValueOnce(1800);

      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/request", {
        method: "POST",
        body: JSON.stringify({ email: "spammer@enterprise.com" }),
      });

      const res = await requestVerifyEmailRoute(req);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("1800");
      const data = await res.json();
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("ignores forged or tampered session cookie and requires valid body email", async () => {
      const forgedCookie = `${encodeSessionPayload({
        userId: "hacker",
        email: "victim@enterprise.com",
        userName: "Hacker",
        timestamp: Date.now(),
      })}.invalid_hmac_signature`;

      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/request", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${forgedCookie}`,
        },
        body: JSON.stringify({}),
      });

      const res = await requestVerifyEmailRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("API: /api/auth/verify-email/confirm", () => {
    it("GET: redirects to /dashboard?verified=true when token is valid", async () => {
      (prisma.verification.findFirst as unknown as Mock).mockResolvedValueOnce({
        id: "verif_valid",
        identifier: "alex@enterprise.com",
        value: "hashed_val",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // Valid for 1h
      });

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_1",
        email: "alex@enterprise.com",
      });

      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/confirm?token=some_token");
      const res = await confirmVerifyEmailGetRoute(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain("/dashboard?verified=true");
    });

    it("GET: redirects to /verify-expired when token is expired", async () => {
      (prisma.verification.findFirst as unknown as Mock).mockResolvedValueOnce({
        id: "verif_expired",
        identifier: "alex@enterprise.com",
        value: "hashed_val",
        expiresAt: new Date(Date.now() - 1000 * 60), // Expired 1m ago
      });

      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/confirm?token=expired_token");
      const res = await confirmVerifyEmailGetRoute(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain("/verify-expired");
    });

    it("POST: returns 200 when token is valid", async () => {
      (prisma.verification.findFirst as unknown as Mock).mockResolvedValueOnce({
        id: "verif_valid",
        identifier: "alex@enterprise.com",
        value: "hashed_val",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_1",
        email: "alex@enterprise.com",
      });

      const req = new NextRequest("http://localhost:3001/api/auth/verify-email/confirm", {
        method: "POST",
        body: JSON.stringify({ token: "valid_token" }),
      });

      const res = await confirmVerifyEmailPostRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.email).toBe("alex@enterprise.com");
    });
  });

  describe("API: POST /api/v1/apps/[id]/install (Marketplace Gate)", () => {
    it("blocks unverified user with HTTP 403 EMAIL_VERIFICATION_REQUIRED", async () => {
      const payload = encodeSessionPayload({
        userId: "user_unverified_1",
        email: "unverified@company.com",
        userName: "Unverified User",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "owner",
        permissions: ["apps:install"],
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      // Database returns emailVerified = false
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_unverified_1",
        emailVerified: false,
      });

      const req = new NextRequest("http://localhost:3001/api/v1/apps/restaurant_pos/install", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const params = Promise.resolve({ id: "restaurant_pos" });
      const res = await installAppRoute(req, { params });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("EMAIL_VERIFICATION_REQUIRED");
      expect(data.detail).toContain("You must verify your email address before installing new applications");
    });

    it("allows verified user to install application and returns HTTP 200", async () => {
      const payload = encodeSessionPayload({
        userId: "user_verified_1",
        email: "verified@company.com",
        userName: "Verified User",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "owner",
        permissions: [PERMISSIONS.APPS.INSTALL],
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      // Database returns emailVerified = true
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_verified_1",
        emailVerified: true,
      });

      (prisma.installedApp.upsert as unknown as Mock).mockResolvedValueOnce({
        id: "inst_1",
        organizationId: "org_alpha",
        appId: "restaurant_pos",
        version: "1.0.0",
        isEnabled: true,
        installedAt: new Date(),
        settings: {},
      });

      const req = new NextRequest("http://localhost:3001/api/v1/apps/restaurant_pos/install", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const params = Promise.resolve({ id: "restaurant_pos" });
      const res = await installAppRoute(req, { params });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.appId).toBe("restaurant_pos");
    });

    it("blocks verified user without apps:install or admin/owner role with HTTP 403 INSUFFICIENT_PERMISSIONS", async () => {
      const payload = encodeSessionPayload({
        userId: "user_member_1",
        email: "member@company.com",
        userName: "Member User",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "member",
        permissions: ["sites:read"],
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user_member_1",
        emailVerified: true,
      });

      (prisma.userBranchRole.findMany as unknown as Mock).mockResolvedValueOnce([
        {
          role: {
            slug: "member",
            permissions: [],
          },
        },
      ]);

      const req = new NextRequest("http://localhost:3001/api/v1/apps/restaurant_pos/install", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const params = Promise.resolve({ id: "restaurant_pos" });
      const res = await installAppRoute(req, { params });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(data.detail).toContain("You do not have permission to install applications");
    });
  });
});
