import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AuthErrorAlert } from "../src/components/auth/auth-error-alert";
import { InvitationContextStrip } from "../src/components/auth/invite/invitation-context-strip";
import { InvitationErrorCard } from "../src/components/auth/invite/invitation-error-card";
import { InvitationAlreadyAcceptedCard } from "../src/components/auth/invite/invitation-already-accepted-card";
import { TenantAvatar } from "../src/components/auth/choose-tenant/tenant-avatar";
import { TenantCard } from "../src/components/auth/choose-tenant/tenant-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const DETAILS = {
  isValid: true,
  token: "tkn",
  email: "invitee@example.com",
  name: "Invitee",
  organizationName: "Acme",
  roleName: "Member",
  branchName: "HQ",
  hasPassword: true,
  expiresAt: "2026-12-01T00:00:00.000Z",
};

describe("AuthErrorAlert", () => {
  it("renders the message inside an alert with the optional action", () => {
    const html = renderToString(
      <AuthErrorAlert
        message="Invalid credentials."
        alertId="auth-error"
        action={<a href="/login">Try again</a>}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('id="auth-error"');
    expect(html).toContain("Invalid credentials.");
    expect(html).toContain("Try again");
  });
});

describe("InvitationContextStrip", () => {
  it("renders the workspace context columns", () => {
    const html = renderToString(<InvitationContextStrip details={DETAILS} />);

    expect(html).toContain("Workspace");
    expect(html).toContain("Acme");
    expect(html).toContain("Member");
    expect(html).toContain("HQ");
    expect(html).toContain("invitee@example.com");
  });

  it("labels a missing branch scope as all branches", () => {
    const html = renderToString(
      <InvitationContextStrip details={{ ...DETAILS, branchName: "" }} />
    );

    expect(html).toContain("All Branches");
  });
});

describe("InvitationErrorCard", () => {
  it("renders the unusable-link notice", () => {
    const html = renderToString(<InvitationErrorCard message="This link expired." />);

    expect(html).toContain("Invitation Notice");
    expect(html).toContain("Unable to Join Workspace");
    expect(html).toContain("This link expired.");
    expect(html).toContain("Return to Sign In");
  });
});

describe("InvitationAlreadyAcceptedCard", () => {
  it("renders the already-accepted notice", () => {
    const html = renderToString(<InvitationAlreadyAcceptedCard email="invitee@example.com" />);

    expect(html).toContain("Invitation Already Accepted");
    expect(html).toContain("Account Ready");
    expect(html).toContain("Go to Sign In");
  });

  it("renders without an email", () => {
    expect(renderToString(<InvitationAlreadyAcceptedCard email={null} />)).toContain(
      "Invitation Already Accepted"
    );
  });

  it("renders with an empty email", () => {
    expect(renderToString(<InvitationAlreadyAcceptedCard email="" />)).toContain(
      "Go to Sign In"
    );
  });
});

describe("TenantAvatar", () => {
  it("renders the organization logo when available", () => {
    const html = renderToString(
      <TenantAvatar name="Acme" logoUrl="https://cdn.example.com/acme.png" />
    );

    expect(html).toContain('src="https://cdn.example.com/acme.png"');
    expect(html).toContain('alt="Acme"');
  });

  it("falls back to the initials when no logo exists", () => {
    const html = renderToString(<TenantAvatar name="acme" logoUrl={null} />);

    expect(html).toContain("AC");
  });
});

describe("TenantCard", () => {
  const TENANT = {
    organizationId: "org_1",
    name: "Acme",
    slug: "acme",
    role: "Owner",
    logoUrl: null,
  };

  it("renders the workspace identity and role", () => {
    const html = renderToString(
      <TenantCard tenant={TENANT} isPending={false} isDisabled={false} onSelect={vi.fn()} />
    );

    expect(html).toContain("Acme");
    expect(html).toContain("acme");
    expect(html).toContain("Owner");
  });

  it("renders the pending spinner variant", () => {
    const html = renderToString(
      <TenantCard tenant={TENANT} isPending isDisabled onSelect={vi.fn()} />
    );

    expect(html).toContain("Acme");
  });
});
