import { describe, it, expect } from "vitest";
import { mapLoginNotice } from "../src/components/auth/login/login-notice";
import { sanitizeRedirect } from "../src/components/auth/login/login-redirect";
import { mapLoginResponse } from "../src/components/auth/login/login-response";
import { resolveLoginDestination } from "../src/components/auth/login/login-destination";
import { mapForgotPasswordResponse } from "../src/components/auth/forgot-password/forgot-password-status";
import { mapTenantsResponse } from "../src/components/auth/choose-tenant/choose-tenant-service";
import {
  formatCollisionBadge,
  formatProviderName,
} from "../src/components/auth/link-account/provider-name";
import { mapLinkAccountResponse } from "../src/components/auth/link-account/link-account-service";
import { validateInvitationCredentials } from "../src/components/auth/invite/invitation-validation";
import { mapInvitationAcceptResponse } from "../src/components/auth/invite/invitation-accept-service";
import { resolveInvitationView } from "../src/components/auth/invite/invitation-view";
import type { InvitationDetails } from "../src/lib/invitation-client";

const DASHBOARD_REDIRECT = "/dashboard";

function queryOf(value: string): URLSearchParams {
  return new URLSearchParams(value);
}

function invitationDetails(
  overrides: Partial<InvitationDetails> = {}
): InvitationDetails {
  return {
    isValid: true,
    token: "tok",
    email: "invitee@example.test",
    name: null,
    organizationName: "Acme",
    roleName: "Manager",
    branchName: "",
    hasPassword: false,
    expiresAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("login notice mapper", () => {
  it("maps the archived notice and known error codes", () => {
    expect(mapLoginNotice(queryOf("notice=archived"))).toContain(
      "organization has been archived"
    );
    expect(mapLoginNotice(queryOf("error=oauth_cancelled"))).toContain(
      "Sign-in was cancelled"
    );
    expect(mapLoginNotice(queryOf("error=oauth_failed"))).toContain(
      "Authentication failed"
    );
    expect(mapLoginNotice(queryOf("error=sso_not_found"))).toContain(
      "SSO connection not found"
    );
  });

  it("resolves the SSO organization from the org parameter", () => {
    expect(mapLoginNotice(queryOf("error=sso_unconfigured&org=Acme"))).toContain(
      "Acme"
    );
  });

  it("falls back to the domain parameter for the SSO organization", () => {
    expect(
      mapLoginNotice(queryOf("error=sso_unconfigured&domain=acme.test"))
    ).toContain("acme.test");
  });

});

describe("login notice fallbacks", () => {
  it("uses a neutral organization label when no identifier is supplied", () => {
    expect(mapLoginNotice(queryOf("error=sso_unconfigured"))).toContain(
      "your organization"
    );
  });

  it("returns null for unknown or absent status codes", () => {
    expect(mapLoginNotice(queryOf("error=unknown"))).toBeNull();
    expect(mapLoginNotice(queryOf(""))).toBeNull();
    expect(mapLoginNotice(queryOf("notice=unknown"))).toBeNull();
  });
});

describe("login redirect sanitizer", () => {
  it("accepts safe internal paths", () => {
    expect(sanitizeRedirect("/sites", "COMPLETED")).toBe("/sites");
    expect(sanitizeRedirect("/pos?table=1", "COMPLETED")).toBe("/pos?table=1");
    expect(sanitizeRedirect("/sites", "")).toBe("/sites");
  });

  it("rejects protocol-relative and backslash escape paths", () => {
    expect(sanitizeRedirect("//evil.test", "COMPLETED")).toBeNull();
    expect(sanitizeRedirect("/\\evil.test", "COMPLETED")).toBeNull();
    expect(sanitizeRedirect("https://evil.test", "COMPLETED")).toBeNull();
  });

  it("rejects auth routes and mid-onboarding accounts", () => {
    expect(sanitizeRedirect("/login", "COMPLETED")).toBeNull();
    expect(sanitizeRedirect("/signup", "COMPLETED")).toBeNull();
    expect(sanitizeRedirect("/forgot-password", "COMPLETED")).toBeNull();
    expect(sanitizeRedirect("/reset-password", "COMPLETED")).toBeNull();
    expect(sanitizeRedirect("/sites", "IN_PROGRESS")).toBeNull();
  });
});

describe("login response mapper", () => {
  it("parses a typed success payload", () => {
    const outcome = mapLoginResponse(
      { ok: true, status: 200 },
      {
        themePreference: "dark",
        redirectUrl: DASHBOARD_REDIRECT,
        user: { permissions: ["pos:*"], onboardingStatus: "COMPLETED" },
      }
    );
    expect(outcome.kind).toBe("success");
  });

  it("prefers the problem detail on failure", () => {
    expect(
      mapLoginResponse({ ok: false, status: 401 }, { detail: "Invalid credentials" })
    ).toEqual({ kind: "failure", message: "Invalid credentials" });
  });

  it("falls back to the error field when detail is absent", () => {
    expect(
      mapLoginResponse({ ok: false, status: 401 }, { error: "MFA required" })
    ).toEqual({ kind: "failure", message: "MFA required" });
  });

  it("uses a status message when no problem detail exists", () => {
    const outcome = mapLoginResponse({ ok: false, status: 503 }, {});
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.message).toContain("503");
    }
  });

});

describe("login response validation", () => {
  it("rejects an unknown theme preference", () => {
    expect(
      mapLoginResponse({ ok: true, status: 200 }, { themePreference: "neon" }).kind
    ).toBe("failure");
  });

  it("rejects a malformed success payload instead of casting it", () => {
    const outcome = mapLoginResponse(
      { ok: true, status: 200 },
      { user: { onboardingStatus: "SOMEWHERE" } }
    );
    expect(outcome.kind).toBe("failure");
  });
});

describe("login destination resolver", () => {
  it("gives the safe query redirect precedence over the server redirect", () => {
    const destination = resolveLoginDestination(
      { redirectUrl: "/pos", user: { onboardingStatus: "COMPLETED" } },
      "/sites"
    );
    expect(destination).toBe("/sites");
  });

  it("uses the server redirect when no safe query redirect exists", () => {
    expect(resolveLoginDestination({ redirectUrl: "/inventory" }, null)).toBe(
      "/inventory"
    );
  });

  it("falls back to the dispatcher route", () => {
    expect(
      resolveLoginDestination({ user: { permissions: ["pos:orders:create"] } }, null)
    ).toBe("/pos");
  });

  it("falls back to the dashboard when nothing else resolves", () => {
    expect(resolveLoginDestination({}, null)).toBe(DASHBOARD_REDIRECT);
  });
});

describe("forgot password status mapper", () => {
  it("reports success for ok and not-found responses", () => {
    expect(mapForgotPasswordResponse({ ok: true, status: 202 }, {})).toEqual({
      kind: "sent",
    });
    expect(mapForgotPasswordResponse({ ok: false, status: 404 }, {})).toEqual({
      kind: "sent",
    });
  });

  it("surfaces rate limiting with the server detail", () => {
    expect(
      mapForgotPasswordResponse({ ok: false, status: 429 }, { detail: "Slow down" })
    ).toEqual({ kind: "failed", message: "Slow down" });
  });

  it("uses the canonical rate-limit fallback without a detail", () => {
    const outcome = mapForgotPasswordResponse({ ok: false, status: 429 }, {});
    expect(outcome.kind).toBe("failed");
  });

});

describe("forgot password anti-enumeration", () => {
  it("keeps the anti-enumeration success for unparseable failures", () => {
    expect(mapForgotPasswordResponse({ ok: false, status: 422 }, {})).toEqual({
      kind: "sent",
    });
  });

  it("surfaces a genuine problem detail for non-rate-limit failures", () => {
    expect(
      mapForgotPasswordResponse({ ok: false, status: 422 }, { detail: "Bad address" })
    ).toEqual({ kind: "failed", message: "Bad address" });
  });
});

describe("tenant list mapper", () => {
  it("parses a tenant list with nullable logos", () => {
    const outcome = mapTenantsResponse(
      { ok: true, status: 200 },
      {
        tenants: [
          {
            organizationId: "org_1",
            name: "Acme",
            slug: "acme",
            role: "Manager",
            logoUrl: null,
          },
        ],
      }
    );
    expect(outcome.kind).toBe("loaded");
    if (outcome.kind === "loaded") {
      expect(outcome.tenants).toHaveLength(1);
    }
  });

});

describe("tenant list failures", () => {
  it("maps a server problem detail on failure", () => {
    expect(
      mapTenantsResponse({ ok: false, status: 500 }, { detail: "Unavailable" })
    ).toEqual({ kind: "failed", message: "Unavailable" });
  });

  it("falls back to the load message without a detail", () => {
    const outcome = mapTenantsResponse({ ok: false, status: 500 }, {});
    expect(outcome.kind).toBe("failed");
  });

});

describe("tenant list validation", () => {
  it("rejects a malformed tenant payload", () => {
    expect(
      mapTenantsResponse({ ok: true, status: 200 }, { tenants: [{ name: "Acme" }] }).kind
    ).toBe("failed");
  });
});

describe("link account mappers", () => {
  it("formats provider labels and collision badges", () => {
    expect(formatProviderName("google")).toBe("Google");
    expect(formatProviderName(null)).toBe("OAuth Provider");
    expect(formatProviderName(undefined)).toBe("OAuth Provider");
    expect(formatCollisionBadge("github")).toBe("Github Collision Challenge");
    expect(formatCollisionBadge(null)).toBeUndefined();
  });

});

describe("link account responses", () => {
  it("maps a successful link to the server redirect", () => {
    expect(
      mapLinkAccountResponse({ ok: true, status: 200 }, { redirectUrl: "/sites" })
    ).toEqual({ kind: "linked", redirectUrl: "/sites" });
  });

  it("defaults a successful link without a redirect to the dashboard", () => {
    expect(mapLinkAccountResponse({ ok: true, status: 200 }, {})).toEqual({
      kind: "linked",
      redirectUrl: DASHBOARD_REDIRECT,
    });
  });

  it("maps a problem detail on failure", () => {
    expect(
      mapLinkAccountResponse({ ok: false, status: 401 }, { detail: "Wrong password" })
    ).toEqual({ kind: "failed", message: "Wrong password" });
  });

  it("maps a generic failure message without a detail", () => {
    expect(mapLinkAccountResponse({ ok: false, status: 500 }, {})).toEqual({
      kind: "failed",
      message: "Failed to link account. Please check your password.",
    });
  });
});

describe("invitation validation", () => {
  const base = { token: "tok", password: "abcdefgh", confirmPassword: "abcdefgh" };

  it("rejects a missing token", () => {
    expect(validateInvitationCredentials({ ...base, token: "" })).toBe(
      "Missing invitation token."
    );
  });

  it("rejects an empty password", () => {
    expect(validateInvitationCredentials({ ...base, password: "" })).toBe(
      "Please enter a password."
    );
  });

  it("rejects a short password with the preserved twelve-character copy", () => {
    expect(validateInvitationCredentials({ ...base, password: "short" })).toBe(
      "Password must be at least 12 characters long."
    );
  });

  it("rejects a mismatched confirmation", () => {
    expect(
      validateInvitationCredentials({ ...base, confirmPassword: "different" })
    ).toBe("Passwords do not match.");
  });

  it("accepts a complete credential pair", () => {
    expect(validateInvitationCredentials(base)).toBeNull();
  });
});

describe("invitation accept mapper", () => {
  it("maps acceptance to the server redirect", () => {
    expect(
      mapInvitationAcceptResponse({ ok: true, status: 200 }, { redirectUrl: "/sites" })
    ).toEqual({ kind: "accepted", redirectUrl: "/sites" });
  });

  it("defaults acceptance without a redirect to the dashboard", () => {
    expect(mapInvitationAcceptResponse({ ok: true, status: 200 }, {})).toEqual({
      kind: "accepted",
      redirectUrl: DASHBOARD_REDIRECT,
    });
  });

  it("maps an already-accepted problem code", () => {
    expect(
      mapInvitationAcceptResponse(
        { ok: false, status: 409 },
        { code: "INVITATION_ACCEPTED", detail: "Already joined" }
      )
    ).toEqual({ kind: "already-accepted", message: "Already joined" });
  });

  it("maps a generic failure without a detail", () => {
    expect(mapInvitationAcceptResponse({ ok: false, status: 500 }, {})).toEqual({
      kind: "failed",
      message: "Failed to accept workspace invitation.",
    });
  });
});

describe("invitation view resolver", () => {
  it("gives loading precedence over every other state", () => {
    expect(
      resolveInvitationView({
        isLoadingDetails: true,
        isAlreadyAccepted: true,
        fetchError: "boom",
        details: null,
      })
    ).toEqual({ kind: "loading" });
  });

  it("exposes the accepted email when the link was already used", () => {
    expect(
      resolveInvitationView({
        isLoadingDetails: false,
        isAlreadyAccepted: true,
        fetchError: "used",
        details: invitationDetails(),
      })
    ).toEqual({ kind: "already-accepted", email: "invitee@example.test" });
  });

});

describe("invitation view errors", () => {
  it("exposes the verification error", () => {
    expect(
      resolveInvitationView({
        isLoadingDetails: false,
        isAlreadyAccepted: false,
        fetchError: "expired",
        details: null,
      })
    ).toEqual({ kind: "error", message: "expired" });
  });

});

describe("invitation view fallbacks", () => {
  it("uses a neutral invalid message when details are absent without an error", () => {
    expect(
      resolveInvitationView({
        isLoadingDetails: false,
        isAlreadyAccepted: false,
        fetchError: null,
        details: null,
      })
    ).toEqual({ kind: "error", message: "Invitation is invalid or has expired." });
  });

  it("returns the loaded details for the form view", () => {
    const details = invitationDetails({ name: "Invitee" });
    expect(
      resolveInvitationView({
        isLoadingDetails: false,
        isAlreadyAccepted: false,
        fetchError: null,
        details,
      })
    ).toEqual({ kind: "form", details });
  });
});