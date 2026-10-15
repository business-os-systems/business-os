import React from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { SSORedirectCard } from "../src/components/auth/sso-redirect-card";
import { EmailPasswordForm } from "../src/components/auth/email-password-form";
import { POST as ssoDiscoverRoute } from "../src/app/api/auth/sso/discover/route";
import { GET as ssoLoginRoute } from "../src/app/api/auth/sso/[id]/login/route";

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    ssoConnection: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@suite/db";

describe("Enterprise SSO & Home Realm Discovery (HRD) Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Component: SSORedirectCard", () => {
    it("renders organization name, domain, and provider details", () => {
      const html = renderToString(
        <SSORedirectCard
          organizationName="Starlight Healthcare"
          domain="starlight-health.org"
          providerType="azure_entra_id"
          ssoLoginUrl="/api/v1/auth/sso/conn-1/login"
        />
      );

      expect(html).toContain("Starlight Healthcare");
      expect(html).toContain("Microsoft Entra ID");
      expect(html).toContain("Managed Workspace");
      expect(html).toContain("Sign in with Enterprise SSO");
      expect(html).toContain("SSO");
    });

    it("renders fallback domain when organization name is not provided", () => {
      const html = renderToString(
        <SSORedirectCard
          domain="acme-industries.com"
          providerType="google_workspace"
          ssoLoginUrl="/api/v1/auth/sso/conn-2/login"
        />
      );

      expect(html).toContain("acme-industries.com");
      expect(html).toContain("Google Workspace");
    });

    it("renders 'Use standard password instead' fallback when callback provided", () => {
      const html = renderToString(
        <SSORedirectCard
          organizationName="Apex Corp"
          domain="apex-corp.com"
          providerType="saml_okta"
          ssoLoginUrl="/api/v1/auth/sso/conn-3/login"
          onSwitchToPassword={() => {}}
        />
      );

      expect(html).toContain("Use standard password instead");
    });
  });

  describe("Component: EmailPasswordForm (Base Credentials Mode)", () => {
    it("renders standard email and password fields in login mode", () => {
      const html = renderToString(
        <EmailPasswordForm mode="login" onSubmit={() => {}} />
      );

      expect(html).toContain("Email Address");
      expect(html).toContain("Password");
      expect(html).toContain("Sign In with Password");
      expect(html).toContain("Keep me signed in for 30 days");
    });
  });

  describe("API: POST /api/auth/sso/discover", () => {
    it("returns 400 problem details for invalid or missing email format", async () => {
      const req = new NextRequest("http://localhost:3110/api/auth/sso/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email" }),
      });

      const res = await ssoDiscoverRoute(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("INVALID_EMAIL");
    });

    it("returns isEnterprise: false for public consumer email domains without querying DB", async () => {
      const req = new NextRequest("http://localhost:3110/api/auth/sso/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "doctor@gmail.com" }),
      });

      const res = await ssoDiscoverRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.domain).toBe("gmail.com");
      expect(data.isEnterprise).toBe(false);
      expect(data.ssoLoginUrl).toBeNull();
      expect(prisma.ssoConnection.findUnique).not.toHaveBeenCalled();
    });

    it("returns isEnterprise: false when corporate domain has no active SSO connection", async () => {
      (prisma.ssoConnection.findUnique as unknown as Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3110/api/auth/sso/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "sarah@unconfigured-domain.com" }),
      });

      const res = await ssoDiscoverRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.domain).toBe("unconfigured-domain.com");
      expect(data.isEnterprise).toBe(false);
      expect(data.ssoLoginUrl).toBeNull();
      expect(prisma.ssoConnection.findUnique).toHaveBeenCalledWith({
        where: { domain: "unconfigured-domain.com" },
        include: { organization: true },
      });
    });

    it("returns isEnterprise: true with organization details and ssoLoginUrl for registered enterprise domain", async () => {
      (prisma.ssoConnection.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "sso-conn-101",
        domain: "starlight-health.org",
        providerType: "azure_entra_id",
        enforceSso: true,
        organizationId: "org-starlight",
        defaultRoleId: "role-staff",
        organization: {
          id: "org-starlight",
          name: "Starlight Healthcare Group",
          slug: "starlight-health",
        },
      });

      const req = new NextRequest("http://localhost:3110/api/auth/sso/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex.kumar@starlight-health.org" }),
      });

      const res = await ssoDiscoverRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.domain).toBe("starlight-health.org");
      expect(data.isEnterprise).toBe(true);
      expect(data.providerType).toBe("azure_entra_id");
      expect(data.organizationName).toBe("Starlight Healthcare Group");
      expect(data.ssoLoginUrl).toContain("/api/v1/auth/sso/sso-conn-101/login");
    });
  });

  describe("API: GET /api/auth/sso/[id]/login", () => {
    it("redirects browser users back to /login with sso_unconfigured error if IdP not configured", async () => {
      (prisma.ssoConnection.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "sso-conn-pending",
        domain: "pending-corp.com",
        config: {},
        organization: { name: "Pending Corp" },
      });

      const req = new NextRequest("http://localhost:3110/api/auth/sso/sso-conn-pending/login", {
        headers: { Accept: "text/html,application/xhtml+xml" },
      });

      const res = await ssoLoginRoute(req, {
        params: Promise.resolve({ id: "sso-conn-pending" }),
      });

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?error=sso_unconfigured");
      expect(location).toContain("domain=pending-corp.com");
    });

    it("returns RFC 7807 501 problem details to API clients if IdP not configured", async () => {
      (prisma.ssoConnection.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "sso-conn-pending",
        domain: "pending-corp.com",
        config: {},
        organization: { name: "Pending Corp" },
      });

      const req = new NextRequest("http://localhost:3110/api/auth/sso/sso-conn-pending/login", {
        headers: { Accept: "application/json" },
      });

      const res = await ssoLoginRoute(req, {
        params: Promise.resolve({ id: "sso-conn-pending" }),
      });

      expect(res.status).toBe(501);
      const data = await res.json();
      expect(data.code).toBe("SSO_IDP_NOT_CONFIGURED");
      expect(data.title).toBe("SSO Configuration Pending");
    });

    it("redirects to external IdP when authUrl is configured", async () => {
      (prisma.ssoConnection.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "sso-conn-active",
        domain: "active-corp.com",
        config: { authUrl: "https://login.microsoftonline.com/tenant-123/saml2" },
        organization: { name: "Active Corp" },
      });

      const req = new NextRequest("http://localhost:3110/api/auth/sso/sso-conn-active/login");

      const res = await ssoLoginRoute(req, {
        params: Promise.resolve({ id: "sso-conn-active" }),
      });

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://login.microsoftonline.com/tenant-123/saml2");
    });
  });
});

