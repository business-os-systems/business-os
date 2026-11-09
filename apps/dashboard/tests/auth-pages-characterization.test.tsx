import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import LoginPage from "../src/app/(auth)/login/page";
import ForgotPasswordPage from "../src/app/(auth)/forgot-password/page";
import ChooseTenantPage from "../src/app/(auth)/choose-tenant/page";
import LinkAccountPage from "../src/app/(auth)/link-account/page";
import AcceptInvitationPage from "../src/app/(auth)/invite/[token]/page";

/**
 * Characterization suite for the authentication pages decomposed by issue #273
 * (Scope B, P7). Every assertion below describes behaviour that must survive the
 * extraction of form bodies, submit hooks and status/error mappers unchanged.
 */

let mockSearchParams = new URLSearchParams();
let mockRouteParams: Record<string, string> = {};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/login",
  useParams: () => mockRouteParams,
}));

function renderLogin(): string {
  return renderToString(<LoginPage />);
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockRouteParams = {};
});

describe("Login page characterization", () => {
  it("renders the sign-in envelope with providers and credential form", () => {
    const html = renderLogin();
    expect(html).toContain("Sign In to Workspace");
    expect(html).toContain("Email Address");
    expect(html).toContain("Password");
    expect(html).toContain("Sign up");
  });

  it("shows the archived-organization notice from the query string", () => {
    mockSearchParams = new URLSearchParams("notice=archived");
    expect(renderLogin()).toContain(
      "This organization has been archived. Please sign in to an active organization."
    );
  });

  it("names the organization in the SSO-not-configured notice", () => {
    mockSearchParams = new URLSearchParams("error=sso_unconfigured&org=AcmeCorp");
    expect(renderLogin()).toContain(
      "Enterprise SSO is not yet configured for AcmeCorp"
    );
  });

});

describe("Login page SSO notice fallbacks", () => {
  it("falls back to the domain when the org parameter is absent", () => {
    mockSearchParams = new URLSearchParams(
      "error=sso_unconfigured&domain=acme.test"
    );
    expect(renderLogin()).toContain(
      "Enterprise SSO is not yet configured for acme.test"
    );
  });

  it("falls back to your organization when no identifier is supplied", () => {
    mockSearchParams = new URLSearchParams("error=sso_unconfigured");
    expect(renderLogin()).toContain(
      "Enterprise SSO is not yet configured for your organization"
    );
  });
});

describe("Login page OAuth status mapping", () => {
  it("maps sso_not_found to the password fallback guidance", () => {
    mockSearchParams = new URLSearchParams("error=sso_not_found");
    expect(renderLogin()).toContain(
      "Enterprise SSO connection not found. Please sign in with your email and password."
    );
  });

  it("maps oauth_cancelled to the cancellation notice", () => {
    mockSearchParams = new URLSearchParams("error=oauth_cancelled");
    expect(renderLogin()).toContain("Sign-in was cancelled.");
  });

  it("maps oauth_failed to an authentication failure", () => {
    mockSearchParams = new URLSearchParams("error=oauth_failed");
    expect(renderLogin()).toContain("Authentication failed.");
  });

  it("renders no alert for an unknown error code", () => {
    mockSearchParams = new URLSearchParams("error=unknown_code");
    const html = renderLogin();
    expect(html).not.toContain("Authentication failed.");
    expect(html).not.toContain("Sign-in was cancelled.");
  });
});

describe("Forgot password page characterization", () => {
  it("renders the recovery card with an email field and submit control", () => {
    const html = renderToString(<ForgotPasswordPage />);
    expect(html).toContain("Reset your password");
    expect(html).toContain("Enter your email address to reset your password.");
    expect(html).toContain("recovery-email");
    expect(html).toContain("Send reset link");
    expect(html).toContain("Remember your password?");
  });

  it("marks the email input as valid on first paint", () => {
    const html = renderToString(<ForgotPasswordPage />);
    expect(html).toContain('aria-invalid="false"');
    expect(html).not.toContain("forgot-password-error");
  });
});

describe("Choose tenant page characterization", () => {
  it("renders the workspace chooser envelope and footer", () => {
    const html = renderToString(<ChooseTenantPage />);
    expect(html).toContain("Select Workspace");
    expect(html).toContain("Choose the organization you want to operate in");
    expect(html).toContain("Sign in with another email");
  });

  it("renders the loading skeleton while the tenant list is unresolved", () => {
    const html = renderToString(<ChooseTenantPage />);
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain("No active workspaces found for this account.");
  });
});

describe("Link account page characterization", () => {
  it("renders the missing-challenge card when no ticket is present", () => {
    const html = renderToString(<LinkAccountPage />);
    expect(html).toContain("Missing Linking Challenge");
    expect(html).toContain(
      "No valid verification challenge was provided. Please sign in with your credentials or OAuth provider."
    );
    expect(html).toContain("Return to Sign in");
  });

  it("renders the password challenge form when a ticket is present", () => {
    mockSearchParams = new URLSearchParams("ticket=test-ticket");
    const html = renderToString(<LinkAccountPage />);
    expect(html).toContain("Link your account");
    expect(html).toContain("Existing Password");
    expect(html).toContain("Link OAuth Provider Account");
  });
});

describe("Invitation accept page characterization", () => {
  it("renders the verifying-invitation card before details resolve", () => {
    mockRouteParams = { token: "valid-test-token" };
    const html = renderToString(<AcceptInvitationPage />);
    expect(html).toContain("Workspace Invitation");
    expect(html).toContain("Verifying invitation details...");
    expect(html).toContain("Loading invitation...");
  });

  it("renders the verifying card when the route token is missing", () => {
    const html = renderToString(<AcceptInvitationPage />);
    expect(html).toContain("Workspace Invitation");
  });
});