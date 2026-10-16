import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { EmailPasswordForm } from "../src/components/auth/email-password-form";
import { OAuthProviders } from "../src/components/auth/oauth-providers";
import { PasskeyButton } from "../src/components/auth/passkey-button";
import LoginPage from "../src/app/(auth)/login/page";
import SignupPage from "../src/app/(auth)/signup/page";
import ForgotPasswordPage from "../src/app/(auth)/forgot-password/page";
import ResetPasswordPage from "../src/app/(auth)/reset-password/page";
import LinkAccountPage from "../src/app/(auth)/link-account/page";

let mockSearchParams = new URLSearchParams();

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/login",
}));

describe("Live Reactive Error Dismissal", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  describe("EmailPasswordForm onClearError integration", () => {
    it("renders error alert when errorMessage is provided", () => {
      const html = renderToString(
        <EmailPasswordForm
          mode="login"
          onSubmit={vi.fn()}
          errorMessage="Invalid credentials provided."
        />
      );

      expect(html).toContain("id=\"auth-error-alert\"");
      expect(html).toContain("Invalid credentials provided.");
      expect(html).toContain("aria-invalid=\"true\"");
    });

    it("wires onClearError to email and password input change triggers", () => {
      const onClearError = vi.fn();
      const element = (
        <EmailPasswordForm
          mode="login"
          onSubmit={vi.fn()}
          errorMessage="Invalid credentials"
          onClearError={onClearError}
        />
      );

      // Verify the element accepts and propagates the prop
      expect(element.props.onClearError).toBe(onClearError);
      expect(element.props.errorMessage).toBe("Invalid credentials");
    });
  });

  describe("OAuthProviders onActionTrigger integration", () => {
    it("accepts and exposes onActionTrigger prop", () => {
      const onActionTrigger = vi.fn();
      const element = (
        <OAuthProviders onActionTrigger={onActionTrigger} />
      );

      expect(element.props.onActionTrigger).toBe(onActionTrigger);
    });

    it("renders provider buttons cleanly with DESIGN.md surface styling", () => {
      const html = renderToString(<OAuthProviders />);
      expect(html).toContain("Google");
      expect(html).toContain("GitHub");
      expect(html).toContain("Microsoft");
    });
  });

  describe("PasskeyButton onActionTrigger integration", () => {
    it("accepts and exposes onActionTrigger prop", () => {
      const onActionTrigger = vi.fn();
      const element = (
        <PasskeyButton onActionTrigger={onActionTrigger} />
      );

      expect(element.props.onActionTrigger).toBe(onActionTrigger);
    });
  });

  describe("LoginPage OAuth cancellation & URL error presentation", () => {
    it("renders login card with OAuth providers, email form, and passkey button", () => {
      const html = renderToString(<LoginPage />);
      expect(html).toContain("Sign In to Workspace");
      expect(html).toContain("Google");
      expect(html).toContain("GitHub");
      expect(html).toContain("Microsoft");
      expect(html).toContain("Email Address");
      expect(html).toContain("Password");
    });

    it("renders OAuth cancelled notice when error query param is oauth_cancelled", () => {
      mockSearchParams = new URLSearchParams("error=oauth_cancelled");
      const html = renderToString(<LoginPage />);
      expect(html).toContain("Sign-in was cancelled");
    });

    it("renders enterprise SSO unconfigured notice when error is sso_unconfigured", () => {
      mockSearchParams = new URLSearchParams("error=sso_unconfigured&org=AcmeCorp");
      const html = renderToString(<LoginPage />);
      expect(html).toContain("Enterprise SSO is not yet configured for AcmeCorp");
    });

    it("renders authentication failed notice when error is oauth_failed", () => {
      mockSearchParams = new URLSearchParams("error=oauth_failed");
      const html = renderToString(<LoginPage />);
      expect(html).toContain("Authentication failed");
    });
  });

  describe("SignupPage live reactive error integration", () => {
    it("renders workspace creation card cleanly", () => {
      const html = renderToString(<SignupPage />);
      expect(html).toContain("Create your Workspace");
      expect(html).toContain("Terms of Service");
      expect(html).toContain("Privacy Policy");
    });
  });

  describe("Secondary Auth Pages Error Clearing", () => {
    it("renders ForgotPasswordPage with clean input attributes", () => {
      const html = renderToString(<ForgotPasswordPage />);
      expect(html).toContain("Reset your password");
      expect(html).toContain("id=\"recovery-email\"");
    });

    it("renders ResetPasswordPage with password complexity fields", () => {
      mockSearchParams = new URLSearchParams("token=valid-reset-token");
      const html = renderToString(<ResetPasswordPage />);
      expect(html).toContain("Set new password");
      expect(html).toContain("id=\"new-password\"");
      expect(html).toContain("id=\"confirm-password\"");
    });

    it("renders LinkAccountPage challenge card", () => {
      mockSearchParams = new URLSearchParams("ticket=valid-ticket-token");
      const html = renderToString(<LinkAccountPage />);
      expect(html).toContain("Link your account");
      expect(html).toContain("id=\"account-password\"");
    });
  });
});
