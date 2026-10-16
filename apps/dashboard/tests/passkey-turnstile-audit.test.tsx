import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { Turnstile } from "../src/components/auth/turnstile";
import { PasskeyButton } from "../src/components/auth/passkey-button";
import { POST as passkeyVerifyRoute } from "../src/app/api/auth/passkey/verify/route";
import { middleware } from "../src/middleware";
import {
  SESSION_COOKIE_NAME,
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "@/lib/auth-constants";
import { AUDIT_EVENT_TYPES } from "@suite/core";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    passkey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: unknown }) => ({ id: "audit_test_1", ...data as object })),
    },
    userOrganization: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
  };
  return { prisma: mockPrisma };
});

describe("Turnstile, Passkey & Rolling Session Gates (@suite/dashboard)", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "suite-test-super-secret-key-32-chars-long!";
  });

  describe("SPEC-02: Cloudflare Turnstile Challenge Widget", () => {
    it("renders Turnstile challenge container with Cloudflare widget attributes", () => {
      const onVerify = vi.fn();
      const html = renderToString(
        <Turnstile onVerify={onVerify} />
      );

      expect(html).toContain("turnstile-widget");
      expect(html).toContain("cf-turnstile-container");
      expect(html).toContain("overflow-hidden");
    });

    it("renders Turnstile with explicit error callback and className override", () => {
      const html = renderToString(
        <Turnstile
          className="custom-turnstile-wrapper"
          onVerify={vi.fn()}
          onError={vi.fn()}
        />
      );

      expect(html).toContain("custom-turnstile-wrapper");
    });
  });

  describe("SPEC-01: FIDO2 / WebAuthn Passkey Button & Verification Route", () => {
    it("renders PasskeyButton gracefully when rendered in server environment", () => {
      const html = renderToString(
        <PasskeyButton
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      // In SSR without window.PublicKeyCredential, it returns null cleanly
      expect(html).toBe("");
    });

    it("rejects invalid passkey verification payload with 400 validation error", async () => {
      const request = new NextRequest("http://localhost:3000/api/auth/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await passkeyVerifyRoute(request);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.type).toBe("/errors/validation-failed");
      expect(json.detail).toContain("Credential ID is required");
    });

    it("rejects unregistered passkey credential with 401 unauthorized", async () => {
      const { prisma } = await import("@suite/db");
      (prisma.passkey.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost:3000/api/auth/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "unknown_credential_id_999",
        }),
      });

      const response = await passkeyVerifyRoute(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.type).toBe("/errors/invalid-credentials");
      expect(json.detail).toContain("Passkey credential not recognized");
    });

    it("successfully verifies registered passkey, updates counter, writes audit log, and sets session cookie", async () => {
      const { prisma } = await import("@suite/db");

      const mockDbPasskey = {
        id: "pk_12345",
        credentialID: "registered_cred_abc",
        counter: 5,
        deviceType: "platform",
        user: {
          id: "user_test_99",
          email: "passkey.user@example.com",
          name: "Passkey Operator",
          metadata: { onboarding_status: "COMPLETED" },
          organizations: [
            {
              organization: {
                id: "org_enterprise_1",
                name: "Acme Corp",
              },
            },
          ],
          branchRoles: [
            {
              branchId: "branch_main",
              role: {
                name: "Operator",
                slug: "operator",
                permissions: [
                  {
                    permission: {
                      action: "core:org:read",
                    },
                  },
                ],
              },
              branch: {
                id: "branch_main",
                name: "Headquarters",
              },
            },
          ],
        },
      };

      (prisma.passkey.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockDbPasskey);
      (prisma.passkey.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ...mockDbPasskey,
        counter: 6,
      });

      const request = new NextRequest("http://localhost:3000/api/auth/passkey/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "user-agent": "Vitest-WebAuthn-Client",
          "x-forwarded-for": "10.0.0.50",
        },
        body: JSON.stringify({
          id: "registered_cred_abc",
          rawId: "cmVnaXN0ZXJlZF9jcmVkX2FiYw==",
          type: "public-key",
          response: {
            clientDataJSON: "eyJjaGFsbGVuZ2UiOiJ0ZXN0In0=",
            authenticatorData: "AQAAAA==",
            signature: "MEQCIA==",
          },
        }),
      });

      const response = await passkeyVerifyRoute(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.user.email).toBe("passkey.user@example.com");
      expect(json.user.permissions).toContain("core:org:read");

      // Verify counter was incremented
      expect(prisma.passkey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pk_12345" },
          data: { counter: { increment: 1 } },
        })
      );

      // Verify audit trail entry was recorded (SPEC-04)
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: "user_test_99",
            action: AUDIT_EVENT_TYPES.AUTH_PASSKEY_VERIFIED,
            ipAddress: "10.0.0.50",
            userAgent: "Vitest-WebAuthn-Client",
          }),
        })
      );

      // Verify session cookie was attached
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(SESSION_COOKIE_NAME);
    });
  });

  describe("SPEC-03: Edge Middleware 24-Hour Rolling Session Sliding Window", () => {
    it("does not refresh session cookie if request is received within 1 hour of issuance", async () => {
      const payload: SessionPayload = {
        userId: "user_rolling_1",
        email: "rolling@example.com",
        userName: "Rolling User",
        role: "owner",
        organizationId: "org_1",
        onboardingStatus: "COMPLETED",
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago (< 1 hour)
      };

      const token = await signSessionToken(encodeSessionPayload(payload));
      const request = new NextRequest("http://localhost:3000/dashboard", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const response = await middleware(request);
      expect(response.status).toBe(200);

      // Set-Cookie should NOT be present when session is younger than 1 hour
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toBeNull();
    });

    it("refreshes session cookie and updates Set-Cookie header if session is older than 1 hour", async () => {
      const payload: SessionPayload = {
        userId: "user_rolling_2",
        email: "rolling2@example.com",
        userName: "Rolling User 2",
        role: "owner",
        organizationId: "org_1",
        onboardingStatus: "COMPLETED",
        timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago (> 1 hour)
      };

      const token = await signSessionToken(encodeSessionPayload(payload));
      const request = new NextRequest("http://localhost:3000/dashboard", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const response = await middleware(request);
      expect(response.status).toBe(200);

      // Set-Cookie MUST be present and contain updated session token
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
    });

    it("redirects users with completed onboarding but no active organization to /choose-tenant (SPEC-05)", async () => {
      const payload: SessionPayload = {
        userId: "user_multi_tenant",
        email: "multitenant@example.com",
        userName: "Multi Tenant User",
        role: "member",
        organizationId: undefined, // No active workspace
        onboardingStatus: "COMPLETED",
        timestamp: Date.now(),
      };

      const token = await signSessionToken(encodeSessionPayload(payload));
      const request = new NextRequest("http://localhost:3000/dashboard", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const response = await middleware(request);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/choose-tenant");
    });
  });
});
