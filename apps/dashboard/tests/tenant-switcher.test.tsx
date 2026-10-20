import React from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import ChooseTenantPage from "../src/app/(auth)/choose-tenant/page";
import { WorkspaceSwitcher } from "../src/components/layout/workspace-switcher";
import { HeaderTopbar } from "../src/components/layout/header-topbar";
import { GET as getTenantsRoute } from "../src/app/api/v1/auth/tenants/route";
import { POST as switchTenantRoute } from "../src/app/api/v1/auth/switch-tenant/route";
import {
  signSessionToken,
  encodeSessionPayload,
  SESSION_COOKIE_NAME,
} from "@suite/auth";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    userOrganization: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    userBranchRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@suite/db";

describe("Multi-Tenancy Disambiguation & Workspace Chooser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = "super-secret-key-that-is-at-least-32-chars-long!";
  });

  describe("Component: ChooseTenantPage", () => {
    it("renders page header and AuthCard envelope with DESIGN.md semantics", () => {
      const html = renderToString(<ChooseTenantPage />);
      expect(html).toContain("Select Workspace");
      expect(html).toContain("Choose the organization you want to operate in");
      expect(html).toContain("Business OS");
      expect(html).toContain("Sign in with another email");
    });
  });

  describe("Component: WorkspaceSwitcher & HeaderTopbar", () => {
    it("renders active workspace name and badge in WorkspaceSwitcher", () => {
      const html = renderToString(
        <WorkspaceSwitcher
          activeOrganizationId="org_riverview"
          activeOrganizationName="River View Homestay"
        />
      );
      expect(html).toContain("River View Homestay");
      expect(html).toContain("RI");
    });

    it("renders WorkspaceSwitcher inside HeaderTopbar with tenant context", () => {
      const html = renderToString(
        <HeaderTopbar
          tenant={{
            organizationId: "org_riverview",
            organizationName: "River View Homestay",
            activeBranchName: "Mukteshwar Main",
            userName: "Rohit Bahuguna",
            userRole: "Tenant Owner",
          }}
        />
      );
      expect(html).toContain("River View Homestay");
      expect(html).toContain("Mukteshwar Main");
      expect(html).toContain("Rohit Bahuguna");
      expect(html).toContain("Tenant Owner");
    });
  });

  describe("API: GET /api/v1/auth/tenants", () => {
    it("returns 401 problem details when session cookie is absent", async () => {
      const req = new NextRequest("http://localhost:3001/api/v1/auth/tenants");
      const res = await getTenantsRoute(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns user workspace memberships when authenticated", async () => {
      const payload = encodeSessionPayload({
        userId: "user_multi_101",
        email: "alex@enterprise.com",
        userName: "Alex Kumar",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "owner",
        permissions: ["*"],
        themePreference: "dark",
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      (prisma.userOrganization.findMany as unknown as Mock).mockResolvedValueOnce([
        {
          userId: "user_multi_101",
          organizationId: "org_alpha",
          organization: {
            id: "org_alpha",
            name: "Alpha Holdings",
            slug: "alpha-holdings",
            metadata: { logoUrl: "https://cdn.example.com/alpha.png" },
          },
        },
        {
          userId: "user_multi_101",
          organizationId: "org_beta",
          organization: {
            id: "org_beta",
            name: "Beta Resort",
            slug: "beta-resort",
            metadata: {},
          },
        },
      ]);

      (prisma.userBranchRole.findFirst as unknown as Mock)
        .mockResolvedValueOnce({ role: { name: "Owner", slug: "owner" } })
        .mockResolvedValueOnce({ role: { name: "Manager", slug: "manager" } });

      const req = new NextRequest("http://localhost:3001/api/v1/auth/tenants", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await getTenantsRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.tenants).toHaveLength(2);
      expect(data.tenants[0].name).toBe("Alpha Holdings");
      expect(data.tenants[0].slug).toBe("alpha-holdings");
      expect(data.tenants[0].role).toBe("Owner");
      expect(data.tenants[0].logoUrl).toBe("https://cdn.example.com/alpha.png");
      expect(data.tenants[1].name).toBe("Beta Resort");
      expect(data.tenants[1].role).toBe("Manager");
    });
  });

  describe("API: POST /api/v1/auth/switch-tenant", () => {
    it("returns 400 when organizationId is missing from request body", async () => {
      const payload = encodeSessionPayload({
        userId: "user_multi_101",
        email: "alex@enterprise.com",
        userName: "Alex Kumar",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "owner",
        permissions: ["*"],
        themePreference: "dark",
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      const req = new NextRequest("http://localhost:3001/api/v1/auth/switch-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({}),
      });

      const res = await switchTenantRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_FAILED");
    });

    it("returns 403 Forbidden when user is not a member of target organization", async () => {
      const payload = encodeSessionPayload({
        userId: "user_multi_101",
        email: "alex@enterprise.com",
        userName: "Alex Kumar",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "owner",
        permissions: ["*"],
        themePreference: "dark",
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      (prisma.userOrganization.findUnique as unknown as Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3001/api/v1/auth/switch-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ organizationId: "org_unauthorized" }),
      });

      const res = await switchTenantRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
    });

    it("switches tenant context, updates session cookie, and returns redirectUrl", async () => {
      const payload = encodeSessionPayload({
        userId: "user_multi_101",
        email: "alex@enterprise.com",
        userName: "Alex Kumar",
        organizationId: "org_alpha",
        organizationName: "Alpha Corp",
        role: "owner",
        permissions: ["*"],
        themePreference: "dark",
        timestamp: Date.now(),
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      });

      const token = await signSessionToken(payload);

      (prisma.userOrganization.findUnique as unknown as Mock).mockResolvedValueOnce({
        userId: "user_multi_101",
        organizationId: "org_beta",
        status: "ACTIVE",
        organization: {
          id: "org_beta",
          name: "Beta Resort",
          slug: "beta-resort",
          branches: [{ id: "branch_resort_main", name: "Main Wing" }],
        },
      });

      (prisma.userBranchRole.findMany as unknown as Mock).mockResolvedValueOnce([
        {
          branchId: "branch_resort_main",
          branch: { id: "branch_resort_main", name: "Main Wing" },
          role: {
            name: "Manager",
            slug: "manager",
            permissions: [{ permission: { action: "pms:reservations:read" } }],
          },
        },
      ]);

      const req = new NextRequest("http://localhost:3001/api/v1/auth/switch-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ organizationId: "org_beta" }),
      });

      const res = await switchTenantRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.redirectUrl).toBeDefined();

      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(SESSION_COOKIE_NAME);
    });
  });
});
