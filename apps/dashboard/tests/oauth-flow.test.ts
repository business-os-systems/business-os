import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as handleOAuthInitiate } from "../src/app/api/auth/oauth/[provider]/route";
import { GET as handleOAuthCallback } from "../src/app/api/auth/callback/[provider]/route";
import * as suiteAuth from "@suite/auth";

vi.mock("@suite/db", () => {
  return {
    prisma: {
      account: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit_123" }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            create: vi.fn().mockResolvedValue({
              id: "usr_auto_oauth_123",
              email: "new.oauth@example.com",
              name: "New OAuth User",
              image: "https://avatar.example.com/pic.png",
              emailVerified: true,
              metadata: {
                onboarding_status: "IN_PROGRESS",
                current_onboarding_step: 1,
              },
            }),
          },
          account: {
            create: vi.fn().mockResolvedValue({
              id: "acc_123",
              userId: "usr_auto_oauth_123",
              providerId: "google",
              accountId: "google_sub_123",
            }),
          },
        };
        return cb(tx);
      }),
    },
  };
});

describe("Federated OAuth Flow (@suite/dashboard)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_CLIENT_ID = "test_google_client_id";
    process.env.GOOGLE_CLIENT_SECRET = "test_google_client_secret";
    process.env.GITHUB_CLIENT_ID = "test_github_client_id";
    process.env.GITHUB_CLIENT_SECRET = "test_github_client_secret";
    process.env.BETTER_AUTH_SECRET = "test_signing_secret_at_least_32_characters_long";
  });

  describe("GET /api/auth/oauth/[provider]", () => {
    it("returns 404 Problem Details for unsupported OAuth provider", async () => {
      const request = new NextRequest("http://localhost:3001/api/auth/oauth/unknown_provider");
      const response = await handleOAuthInitiate(request, {
        params: Promise.resolve({ provider: "unknown_provider" }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.type).toBe("/errors/provider-not-supported");
      expect(json.detail).toContain("unknown_provider");
    });

    it("generates 32-byte CSRF cookie and redirects to provider authorization URL", async () => {
      const request = new NextRequest("http://localhost:3001/api/auth/oauth/google");
      const response = await handleOAuthInitiate(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(location).toContain("client_id=test_google_client_id");
      expect(location).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fauth%2Fcallback%2Fgoogle");

      // Verify oauth_state cookie is set
      const stateCookie = response.cookies.get("oauth_state");
      expect(stateCookie).toBeDefined();
      expect(stateCookie?.value).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(stateCookie?.httpOnly).toBe(true);
    });

    it("redirects to /login?error=sso_unconfigured when client ID is missing", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const request = new NextRequest("http://localhost:3001/api/auth/oauth/google");
      const response = await handleOAuthInitiate(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:3001/login?error=sso_unconfigured");
    });
  });

  describe("GET /api/auth/callback/[provider]", () => {
    it("intercepts provider error and redirects to /login?error=oauth_cancelled with cleared cookie", async () => {
      const request = new NextRequest("http://localhost:3001/api/auth/callback/google?error=access_denied");
      request.cookies.set("oauth_state", "active_state_nonce");

      const response = await handleOAuthCallback(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:3001/login?error=oauth_cancelled");

      const clearedCookie = response.cookies.get("oauth_state");
      expect(clearedCookie?.maxAge).toBe(0);
    });

    it("rejects when CSRF state is mismatched or missing and redirects to /login?error=oauth_failed", async () => {
      const request = new NextRequest("http://localhost:3001/api/auth/callback/google?code=123&state=attacker_state");
      request.cookies.set("oauth_state", "legit_state");

      const response = await handleOAuthCallback(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:3001/login?error=oauth_failed");
    });

    it("detects account collision and redirects to /link-account with signed ticket", async () => {
      const validNonce = "nonce_1234567890abcdef";
      const request = new NextRequest(
        `http://localhost:3001/api/auth/callback/google?code=auth_code_ok&state=${validNonce}`,
      );
      request.cookies.set("oauth_state", validNonce);

      // Mock exchange
      vi.spyOn(suiteAuth, "exchangeOAuthCode").mockResolvedValue({
        provider: "google",
        tokens: { accessToken: "mock_tok_123" },
        profile: {
          id: "google_user_sub_99",
          email: "existing.member@company.com",
          name: "Existing Member",
          emailVerified: true,
        },
      });

      const { prisma } = await import("@suite/db");
      // Account does not exist
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never);
      // But user DOES exist
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "usr_existing_123",
        email: "existing.member@company.com",
      } as never);

      const response = await handleOAuthCallback(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/link-account?ticket=");

      // Verify the ticket can be decoded and verified by suiteAuth
      const url = new URL(location!);
      const ticketParam = url.searchParams.get("ticket");
      expect(ticketParam).toBeDefined();
      const verified = suiteAuth.verifyAccountLinkingTicket(ticketParam!, process.env.BETTER_AUTH_SECRET!);
      expect(verified).not.toBeNull();
      expect(verified?.email).toBe("existing.member@company.com");
      expect(verified?.providerId).toBe("google");
    });

    it("auto-provisions new user and redirects to /onboarding/step-1", async () => {
      const validNonce = "valid_nonce_abc";
      const request = new NextRequest(
        `http://localhost:3001/api/auth/callback/google?code=auth_code_ok&state=${validNonce}`,
      );
      request.cookies.set("oauth_state", validNonce);

      vi.spyOn(suiteAuth, "exchangeOAuthCode").mockResolvedValue({
        provider: "google",
        tokens: { accessToken: "mock_tok_123" },
        profile: {
          id: "google_sub_123",
          email: "new.oauth@example.com",
          name: "New OAuth User",
          emailVerified: true,
        },
      });

      const { prisma } = await import("@suite/db");
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      const response = await handleOAuthCallback(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:3001/onboarding/step-1");

      const sessionCookie = response.cookies.get(suiteAuth.SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toBeDefined();
    });

    it("logs in existing OAuth user, updates tokens, and redirects to dashboard", async () => {
      const validNonce = "nonce_existing_user";
      const request = new NextRequest(
        `http://localhost:3001/api/auth/callback/google?code=auth_code_ok&state=${validNonce}`,
      );
      request.cookies.set("oauth_state", validNonce);

      vi.spyOn(suiteAuth, "exchangeOAuthCode").mockResolvedValue({
        provider: "google",
        tokens: {
          accessToken: "fresh_access_token",
          refreshToken: "fresh_refresh_token",
          expiresIn: 3600,
        },
        profile: {
          id: "google_existing_123",
          email: "existing.oauth@company.com",
          name: "Existing User",
          emailVerified: true,
        },
      });

      const { prisma } = await import("@suite/db");
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "acc_existing_123",
        userId: "usr_existing_123",
        providerId: "google",
        accountId: "google_existing_123",
        user: {
          id: "usr_existing_123",
          email: "existing.oauth@company.com",
          name: "Existing User",
          metadata: { onboarding_status: "COMPLETED" },
          organizations: [{ organizationId: "org_1", organization: { name: "Org 1" } }],
          branchRoles: [{ role: { name: "Admin" }, branch: { name: "Main" } }],
        },
      } as never);

      const response = await handleOAuthCallback(request, {
        params: Promise.resolve({ provider: "google" }),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:3001/dashboard");

      // Verify account tokens update was called
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "acc_existing_123" },
          data: expect.objectContaining({
            accessToken: "fresh_access_token",
            refreshToken: "fresh_refresh_token",
          }),
        }),
      );

      const sessionCookie = response.cookies.get(suiteAuth.SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
    });
  });
});

