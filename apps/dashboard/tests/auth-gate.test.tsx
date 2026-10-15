import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import LoginPage from "../src/app/(auth)/login/page";
import OverviewPage from "../src/app/(dashboard)/page";
import { HeaderTopbar } from "../src/components/layout/header-topbar";

import {
  GlobeIcon,
  ShoppingCartIcon,
  BuildingIcon,
  PackageIcon,
} from "@suite/ui/icons";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/login",
}));

describe("Platform Auth Gate & Login Route (@suite/dashboard)", () => {
  describe("LoginPage Component", () => {
    it("renders the login card with brand identity and credentials form", () => {
      const html = renderToString(<LoginPage />);

      expect(html).toContain("Business OS");
      expect(html).toContain("Sign In to Workspace");
      expect(html).toContain("operator@company.com");
      expect(html).toContain("Sign up");
    });
  });

  describe("Workspace App Launcher (OverviewPage)", () => {
    it("renders Executive App Launcher heading and dynamic subtitle", () => {
      const html = renderToString(<OverviewPage />);

      expect(html).toContain("Executive App Launcher");
      expect(html).toContain("Welcome to your Business OS workspace");
    });

    it("renders Website Builder as Available with active Open Application link", () => {
      const html = renderToString(
        <OverviewPage
          initialApps={[
            {
              title: "Website Builder & Headless CMS",
              code: "App 01",
              desc: "Visual canvas studio and edge storefront delivery.",
              href: "/sites",
              icon: GlobeIcon,
              status: "Available",
              isAvailable: true,
            },
          ]}
        />
      );

      expect(html).toContain("Website Builder &amp; Headless CMS");
      expect(html).toContain("Available");
      expect(html).toContain("Open Application");
      expect(html).toContain("href=\"/sites\"");
    });

    it("renders upcoming modular apps with Coming Soon status", () => {
      const html = renderToString(
        <OverviewPage
          initialApps={[
            {
              title: "Lodging Property Management (PMS)",
              code: "App 03",
              desc: "Multi-property reservation calendar.",
              href: "/pms",
              icon: BuildingIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
            {
              title: "Restaurant POS & KDS",
              code: "App 04",
              desc: "Touch ordering and shift reconciliation.",
              href: "/pos",
              icon: ShoppingCartIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
            {
              title: "Central Inventory & Stock Requisitions",
              code: "App 05",
              desc: "Multi-warehouse stock balances.",
              href: "/inventory",
              icon: PackageIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
          ]}
        />
      );

      expect(html).toContain("Lodging Property Management (PMS)");
      expect(html).toContain("Restaurant POS &amp; KDS");
      expect(html).toContain("Central Inventory &amp; Stock Requisitions");
      expect(html).toContain("Coming Soon");
    });
  });

  describe("HeaderTopbar Sign-Out Action", () => {
    it("renders dynamic tenant name and Sign Out button", () => {
      const html = renderToString(
        <HeaderTopbar
          tenant={{
            organizationId: "org-custom",
            organizationName: "Global Hospitality Holdings",
            activeBranchName: "Main Branch",
          }}
        />
      );

      expect(html).toContain("Global Hospitality Holdings");
      expect(html).toContain("Sign Out");
    });
  });

  describe("OAuthProviderRegistry (Open-Closed Principle)", async () => {
    const { oauthRegistry } = await import("../src/lib/oauth-registry");

    it("has Google, Microsoft, and GitHub enabled by default", () => {
      const active = oauthRegistry.getActiveProviders();
      const ids = active.map((p) => p.id);

      expect(ids).toContain("google");
      expect(ids).toContain("microsoft");
      expect(ids).toContain("github");
    });

    it("allows registering an additional provider (e.g. Apple) without core modification", () => {
      oauthRegistry.register({
        id: "apple",
        name: "Apple",
        iconName: "apple",
        enabled: true,
        scopes: ["name", "email"],
        getAuthUrl: (redirectUri, state) =>
          `https://appleid.apple.com/auth/authorize?redirect_uri=${redirectUri}&state=${state}`,
      });

      const apple = oauthRegistry.get("apple");
      expect(apple).toBeDefined();
      expect(apple?.name).toBe("Apple");
      expect(apple?.getAuthUrl("http://localhost/callback", "xyz")).toContain(
        "appleid.apple.com"
      );
    });

    it("throws when required OAuth client ID environment variables are missing", () => {
      const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;

      const google = oauthRegistry.get("google");
      expect(() => google?.getAuthUrl("http://localhost/callback", "state123")).toThrow(
        "Missing GOOGLE_CLIENT_ID environment variable"
      );

      if (originalGoogleId) {
        process.env.GOOGLE_CLIENT_ID = originalGoogleId;
      }
    });

    it("generates authorization URL using environment variable client ID without mock defaults", () => {
      process.env.GOOGLE_CLIENT_ID = "prod-client-id-12345.apps.googleusercontent.com";
      const google = oauthRegistry.get("google");
      const url = google?.getAuthUrl("http://localhost/callback", "state123");
      expect(url).toContain("client_id=prod-client-id-12345.apps.googleusercontent.com");
      delete process.env.GOOGLE_CLIENT_ID;
    });
  });

  describe("Post-Login Route Dispatcher (resolvePostLoginRoute)", async () => {
    const { resolvePostLoginRoute } = await import("../src/lib/route-dispatcher");

    it("routes platform super admin directly to /super-admin", () => {
      expect(
        resolvePostLoginRoute({
          isSuperAdmin: true,
          roleSlug: "platform-super-admin",
        })
      ).toBe("/super-admin");
    });

    it("routes incomplete onboarding users to their last saved step", () => {
      expect(
        resolvePostLoginRoute({
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 2,
        })
      ).toBe("/onboarding/step-2");
    });

    it("routes master roles (owner, admin, manager) to executive dashboard", () => {
      expect(
        resolvePostLoginRoute({
          roleSlug: "owner",
          onboardingStatus: "COMPLETED",
          assignedAppCodes: ["pos"],
        })
      ).toBe("/dashboard");

      expect(
        resolvePostLoginRoute({
          roleSlug: "manager",
          onboardingStatus: "COMPLETED",
        })
      ).toBe("/dashboard");
    });

    it("routes single-app frontline users directly to their application", () => {
      expect(
        resolvePostLoginRoute({
          roleSlug: "cashier",
          onboardingStatus: "COMPLETED",
          assignedAppCodes: ["pos"],
        })
      ).toBe("/pos");

      expect(
        resolvePostLoginRoute({
          roleSlug: "author",
          onboardingStatus: "COMPLETED",
          permissions: ["cms:edit_page"],
        })
      ).toBe("/sites");
    });

    it("allows registering dynamic modular app routes via registerAppRoute", async () => {
      const { registerAppRoute, getAppRoute } = await import("../src/lib/route-dispatcher");
      registerAppRoute("custom_crm", "/crm");

      expect(getAppRoute("custom_crm")).toBe("/crm");
      expect(
        resolvePostLoginRoute({
          roleSlug: "sales_rep",
          onboardingStatus: "COMPLETED",
          assignedAppIds: ["custom_crm"],
        })
      ).toBe("/crm");
    });
  });

  describe("Cloudflare Turnstile Bot Defense (verifyTurnstileToken)", async () => {
    const { verifyTurnstileToken, TURNSTILE_TEST_SITE_KEY, TURNSTILE_TEST_SECRET_KEY } =
      await import("../src/lib/turnstile");

    it("passes verification in non-production test mode with Cloudflare test token", async () => {
      const result = await verifyTurnstileToken("cf-turnstile-test-token-valid");
      expect(result.success).toBe(true);
      expect(result.hostname).toBeUndefined();
    });

    it("rejects missing or empty Turnstile token", async () => {
      const emptyResult = await verifyTurnstileToken("");
      expect(emptyResult.success).toBe(false);
      expect(emptyResult.errorCodes).toContain("missing-input-response");

      const nullResult = await verifyTurnstileToken(null);
      expect(nullResult.success).toBe(false);
    });

    it("provides the official Cloudflare dummy test keys", () => {
      expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
      expect(TURNSTILE_TEST_SECRET_KEY).toBe("2x00000000000000000000AB");
    });
  });

  describe("Session Expiration & Cookie Utilities", async () => {
    const {
      createSessionCookieOptions,
      SESSION_EPHEMERAL_MAX_AGE_SECONDS,
      SESSION_PERSISTENT_MAX_AGE_SECONDS,
    } = await import("../src/lib/auth-constants");

    it("exports 24h ephemeral and 30d persistent constants", () => {
      expect(SESSION_EPHEMERAL_MAX_AGE_SECONDS).toBe(86400);
      expect(SESSION_PERSISTENT_MAX_AGE_SECONDS).toBe(2592000);
    });

    it("configures cookie maxAge appropriately based on keepSignedIn flag", () => {
      const ephemeral = createSessionCookieOptions(false, false);
      expect(ephemeral.maxAge).toBe(86400);

      const persistent = createSessionCookieOptions(false, true);
      expect(persistent.maxAge).toBe(2592000);

      const custom = createSessionCookieOptions(false, false, 3600);
      expect(custom.maxAge).toBe(3600);
    });
  });

  describe("Environment Configuration Helper (@suite/dashboard/lib/env)", async () => {
    const { isProduction, isTest, getBetterAuthSecret } = await import(
      "../src/lib/env"
    );

    it("correctly identifies test environment", () => {
      expect(isTest).toBe(true);
      expect(isProduction).toBe(false);
    });

    it("reads BETTER_AUTH_SECRET without static fallbacks", () => {
      process.env.BETTER_AUTH_SECRET = "test-secret-value-32-chars-long!";
      expect(getBetterAuthSecret()).toBe("test-secret-value-32-chars-long!");
    });
  });

  describe("AuthCard Component (DESIGN.md modal-sm)", async () => {
    const { AuthCard } = await import("../src/components/auth/auth-card");

    it("renders title, subtitle, badge, and content in 400px card", () => {
      const html = renderToString(
        <AuthCard
          title="Sign in to your account"
          subtitle="Welcome back"
          badge="Secure Gate"
          footer={<span>Footer Link</span>}
        >
          <div data-testid="card-child">Form Content</div>
        </AuthCard>
      );

      expect(html).toContain("Sign in to your account");
      expect(html).toContain("Welcome back");
      expect(html).toContain("Secure Gate");
      expect(html).toContain("Form Content");
      expect(html).toContain("Footer Link");
      expect(html).toContain("max-w-[400px]");
    });
  });

  describe("EmailPasswordForm Component (Complexity & Mode Handling)", async () => {
    const { EmailPasswordForm } = await import(
      "../src/components/auth/email-password-form"
    );

    it("renders login mode with keep me signed in checkbox and forgot password link", () => {
      const html = renderToString(
        <EmailPasswordForm
          mode="login"
          onSubmit={() => {}}
          onForgotPassword={() => {}}
        />
      );

      expect(html).toContain("Email Address");
      expect(html).toContain("Password");
      expect(html).toContain("Keep me signed in for 30 days");
      expect(html).toContain("Forgot password?");
      expect(html).toContain("Sign In with Password");
    });

    it("renders signup mode without Full Name field and with Create Account CTA", () => {
      const html = renderToString(
        <EmailPasswordForm
          mode="signup"
          onSubmit={() => {}}
        />
      );

      expect(html).not.toContain("Full Name");
      expect(html).toContain("Email Address");
      expect(html).toContain("Password");
      expect(html).not.toContain("Keep me signed in for 30 days");
      expect(html).toContain("Create Account");
    });

    it("renders error alert message when provided", () => {
      const html = renderToString(
        <EmailPasswordForm
          mode="login"
          onSubmit={() => {}}
          errorMessage="Invalid credentials provided"
        />
      );

      expect(html).toContain("Invalid credentials provided");
      expect(html).toContain("role=\"alert\"");
    });
  });

  describe("User Registration & Login API Contracts", () => {
    it("rejects invalid registration payload with 400 problem details", async () => {
      const { POST: registerPost } = await import(
        "../src/app/api/auth/register/route"
      );

      const invalidReq = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email", password: "short" }),
      });

      const res = await registerPost(invalidReq);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.type).toBe("/errors/validation-failed");
    });

    it("rejects weak passwords with 400 problem details", async () => {
      const { POST: registerPost } = await import(
        "../src/app/api/auth/register/route"
      );

      const weakReq = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "valid@enterprise.com",
          name: "Test User",
          password: "alllowercasepassword",
        }),
      });

      const res = await weakReq ? await registerPost(weakReq) : null;
      expect(res?.status).toBe(400);

      const json = await res?.json();
      expect(json.type).toBe("/errors/weak-password");
    });

    it("rejects login request with missing password with 400 problem details", async () => {
      const { POST: loginPost } = await import(
        "../src/app/api/auth/login/route"
      );

      const invalidLogin = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@enterprise.com", password: "" }),
      });

      const res = await loginPost(invalidLogin);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.type).toBe("/errors/validation-failed");
    });

    it("dynamically derives clean name from email address when name is omitted", async () => {
      const { deriveNameFromEmail } = await import(
        "../src/app/api/auth/register/route"
      );
      expect(deriveNameFromEmail("rohit.bahuguna@example.com")).toBe("Rohit Bahuguna");
      expect(deriveNameFromEmail("operator@company.com")).toBe("Operator");
      expect(deriveNameFromEmail("jane_doe@test.org")).toBe("Jane Doe");
      expect(deriveNameFromEmail("alice-smith@corp.net")).toBe("Alice Smith");
    });
  });
});

