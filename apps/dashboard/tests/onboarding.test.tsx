import React from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { OnboardingStepper } from "../src/components/onboarding/onboarding-stepper";
import OnboardingStep1Page from "../src/app/onboarding/step-1/page";
import OnboardingStep2Page from "../src/app/onboarding/step-2/page";
import OnboardingStep3Page from "../src/app/onboarding/step-3/page";
import AcceptInvitationPage from "../src/app/(auth)/invite/[token]/page";
import { GET as checkSlugRoute } from "../src/app/api/v1/onboarding/check-slug/route";
import { GET as step1GetRoute, POST as step1Route } from "../src/app/api/v1/onboarding/step-1/route";
import { POST as step2Route } from "../src/app/api/v1/onboarding/step-2/route";
import { POST as completeRoute } from "../src/app/api/v1/onboarding/complete/route";
import { POST as acceptInvitationRoute } from "../src/app/api/v1/auth/invitation/accept/route";
import {
  signSessionToken,
  encodeSessionPayload,
  SESSION_COOKIE_NAME,
} from "@suite/auth/session";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({
    token: "valid-test-token",
  }),
  usePathname: () => "/onboarding/step-1",
}));

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    organization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    branch: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    userOrganization: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    role: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    userBranchRole: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    installedApp: {
      upsert: vi.fn(),
    },
    organizationInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return cb(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@suite/db";

describe("Platform Onboarding Pipeline & Tenant Bootstrapping (@suite/dashboard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = "test-secret-value-32-chars-long!";
  });

  describe("UI Components & Stepper Rendering", () => {
    it("renders OnboardingStepper for all 3 steps with proper progression states", () => {
      const step1Html = renderToString(<OnboardingStepper currentStep={1} />);
      expect(step1Html).toContain("Organization Details");
      expect(step1Html).toContain("Application Selection");
      expect(step1Html).toContain("Workspace Setup");

      const step2Html = renderToString(<OnboardingStepper currentStep={2} />);
      expect(step2Html).toContain("Organization Details");
      expect(step2Html).toContain("Application Selection");

      const step3Html = renderToString(<OnboardingStepper currentStep={3} />);
      expect(step3Html).toContain("Workspace Setup");
    });

    it("renders OnboardingStep1Page with organization form and domain prefix/suffix", () => {
      const html = renderToString(<OnboardingStep1Page />);
      expect(html).toContain("Name your workspace");
      expect(html).toContain("Organization Name");
      expect(html).toContain("Workspace Domain");
      expect(html).toContain(".businessos.app");
      expect(html).toContain("Industry Domains");
      expect(html).toContain("Continue to App Selection");
    });

    it("renders OnboardingStep2Page with recommended and additional apps catalog", () => {
      const html = renderToString(<OnboardingStep2Page />);
      expect(html).toContain("Choose applications for your workspace");
      expect(html).toContain("Recommended for your industry");
      expect(html).toContain("Website &amp; Headless CMS");
      expect(html).toContain("Property &amp; Room Management");
      expect(html).toContain("Continue to Workspace Setup");
    });

    it("renders OnboardingStep3Page with workspace provisioning progress elements", () => {
      const html = renderToString(<OnboardingStep3Page />);
      expect(html).toContain("Preparing your workspace");
      expect(html).toContain("Workspace Provisioning");
      expect(html).toContain("Tenant Boundary &amp; Isolation");
      expect(html).toContain("Role &amp; Permission Matrix");
    });

    it("renders AcceptInvitationPage with invitation join card", () => {
      const html = renderToString(<AcceptInvitationPage />);
      expect(html).toContain("Workspace Invitation");
      expect(html).toContain("You have been invited to join an organization workspace");
      expect(html).toContain("Accept Invitation &amp; Join Workspace");
    });
  });

  describe("API: GET /api/v1/onboarding/check-slug", () => {
    it("returns 400 problem details when slug is invalid or too short", async () => {
      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/check-slug?slug=a");
      const res = await checkSlugRoute(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe("INVALID_SLUG");
    });

    it("returns available: false when slug is already taken", async () => {
      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce({ id: "org-existing-1" });

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/check-slug?slug=acme-corp");
      const res = await checkSlugRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.available).toBe(false);
      expect(data.slug).toBe("acme-corp");
    });

    it("returns available: true when slug is free", async () => {
      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/check-slug?slug=starlight-hospital");
      const res = await checkSlugRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.available).toBe(true);
      expect(data.slug).toBe("starlight-hospital");
    });

    it("returns available: true and isCurrentOrg: true when slug belongs to caller's own organization", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-owner-1",
          organizationId: "org-my-1",
          email: "owner@test.com",
          userName: "Owner User",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 2,
        })
      );

      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce({ id: "org-my-1" });

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/check-slug?slug=my-own-workspace", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });
      const res = await checkSlugRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.available).toBe(true);
      expect(data.isCurrentOrg).toBe(true);
      expect(data.slug).toBe("my-own-workspace");
    });
  });

  describe("API: POST /api/v1/onboarding/step-1", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: "Test Org",
          organizationSlug: "test-org",
          industries: ["Healthcare & Medical"],
        }),
      });

      const res = await step1Route(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns 409 conflict when domain slug is already registered", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 1,
        })
      );

      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce({ id: "existing-org" });

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({
          organizationName: "Taken Org",
          organizationSlug: "taken-org",
          industries: ["Technology & Software"],
        }),
      });

      const res = await step1Route(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("DOMAIN_TAKEN");
    });

    it("handles concurrent registration race condition (Prisma P2002) and returns 409 DOMAIN_TAKEN", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 1,
        })
      );

      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce(null);
      (prisma.$transaction as unknown as Mock).mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`slug`)",
      });

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({
          organizationName: "Race Org",
          organizationSlug: "race-org",
          industries: ["Technology & Software"],
        }),
      });

      const res = await step1Route(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("DOMAIN_TAKEN");
      expect(data.detail).toContain("just claimed by another organization");
    });

    it("bootstraps organization, root branch, owner role, and sets step 2 in session", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 1,
        })
      );

      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce(null);
      (prisma.organization.create as unknown as Mock).mockResolvedValueOnce({
        id: "org-new-1",
        name: "Acme Healthcare",
        slug: "acme-healthcare",
      });
      (prisma.branch.create as unknown as Mock).mockResolvedValueOnce({
        id: "branch-root-1",
        organizationId: "org-new-1",
        name: "Main Location",
        code: "MAIN",
      });
      (prisma.role.findFirst as unknown as Mock).mockResolvedValueOnce(null);
      (prisma.role.create as unknown as Mock).mockResolvedValueOnce({
        id: "role-owner-1",
        organizationId: "org-new-1",
        slug: "owner",
      });
      (prisma.userBranchRole.findFirst as unknown as Mock).mockResolvedValueOnce(null);
      (prisma.userBranchRole.create as unknown as Mock).mockResolvedValueOnce({});
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user-123",
        email: "owner@test.com",
        name: "Owner User",
        metadata: {},
      });
      (prisma.user.update as unknown as Mock).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({
          organizationName: "Acme Healthcare",
          organizationSlug: "acme-healthcare",
          industries: ["Healthcare & Medical"],
        }),
      });

      const res = await step1Route(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.nextStep).toBe(2);
      expect(data.redirectUrl).toBe("/onboarding/step-2");

      // Verify cookies updated
      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toContain(SESSION_COOKIE_NAME);
    });

    it("returns pre-populated organization data for returning users on GET /api/v1/onboarding/step-1", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          organizationId: "org-existing-1",
          organizationName: "Existing Org",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 2,
        })
      );

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user-123",
        metadata: { active_organization_id: "org-existing-1" },
        organizations: [{ organizationId: "org-existing-1" }],
      });

      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "org-existing-1",
        name: "Existing Org",
        slug: "existing-org",
        metadata: { industries: ["Healthcare & Medical", "Hospitality & Lodging"] },
      });

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-1", {
        method: "GET",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await step1GetRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.organizationName).toBe("Existing Org");
      expect(data.organizationSlug).toBe("existing-org");
      expect(data.industries).toEqual(["Healthcare & Medical", "Hospitality & Lodging"]);
    });

    it("allows idempotent re-submission when returning from Step 2 without DOMAIN_TAKEN collision", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          organizationId: "org-existing-1",
          organizationName: "Existing Org",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 2,
        })
      );

      (prisma.userOrganization.findMany as unknown as Mock).mockResolvedValueOnce([
        { organizationId: "org-existing-1" },
      ]);
      (prisma.organization.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "org-existing-1",
      });
      (prisma.organization.update as unknown as Mock).mockResolvedValueOnce({
        id: "org-existing-1",
        name: "Updated Org Name",
        slug: "existing-org",
      });
      (prisma.branch.findFirst as unknown as Mock).mockResolvedValueOnce({
        id: "branch-main-1",
        name: "Main Location",
        code: "MAIN",
      });
      (prisma.userOrganization.upsert as unknown as Mock).mockResolvedValueOnce({});
      (prisma.role.findFirst as unknown as Mock).mockResolvedValueOnce({ id: "role-owner-1" });
      (prisma.userBranchRole.findFirst as unknown as Mock).mockResolvedValueOnce({});
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user-123",
        email: "owner@test.com",
        name: "Owner User",
        metadata: {},
      });
      (prisma.user.update as unknown as Mock).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({
          organizationName: "Updated Org Name",
          organizationSlug: "existing-org",
          industries: ["Healthcare & Medical"],
        }),
      });

      const res = await step1Route(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.nextStep).toBe(2);
    });
  });

  describe("API: POST /api/v1/onboarding/step-2", () => {
    it("returns 400 when selectedApps is empty", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          organizationId: "org-new-1",
          organizationName: "Acme Healthcare",
          role: "owner",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 2,
        })
      );

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({
          selectedApps: [],
        }),
      });

      const res = await step2Route(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("persists selectedApps in user metadata and sets step 3 in session", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          organizationId: "org-new-1",
          organizationName: "Acme Healthcare",
          role: "owner",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 2,
        })
      );

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user-123",
        email: "owner@test.com",
        name: "Owner User",
        metadata: { current_onboarding_step: 2 },
      });
      (prisma.user.update as unknown as Mock).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/step-2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({
          selectedApps: ["website-builder", "lodging-pms", "retail-pos"],
        }),
      });

      const res = await step2Route(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.nextStep).toBe(3);
      expect(data.redirectUrl).toBe("/onboarding/step-3");
    });
  });

  describe("API: POST /api/v1/onboarding/complete", () => {
    it("provisions InstalledApp records, marks onboarding COMPLETED and returns redirectUrl", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "user-123",
          email: "owner@test.com",
          userName: "Owner User",
          organizationId: "org-new-1",
          organizationName: "Acme Healthcare",
          role: "owner",
          themePreference: "dark",
          timestamp: Date.now(),
          onboardingStatus: "IN_PROGRESS",
          currentOnboardingStep: 3,
        })
      );

      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "user-123",
        email: "owner@test.com",
        name: "Owner User",
        metadata: {
          selected_apps: ["website-builder", "lodging-pms"],
        },
        organizations: [
          {
            organizationId: "org-new-1",
            organization: { id: "org-new-1", name: "Acme Healthcare" },
          },
        ],
        branchRoles: [
          {
            organizationId: "org-new-1",
            branch: { id: "branch-root-1", name: "Main Location" },
          },
        ],
      });
      (prisma.installedApp.upsert as unknown as Mock).mockResolvedValue({});
      (prisma.user.update as unknown as Mock).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3110/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({}),
      });

      const res = await completeRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.onboardingStatus).toBe("COMPLETED");
      expect(data.redirectUrl).toBe("/dashboard");
      expect(data.installedApps).toEqual(["website-builder", "lodging-pms"]);
    });
  });

  describe("API: POST /api/v1/auth/invitation/accept", () => {
    it("returns 404 if invitation token is not found", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "invited-user-456",
          email: "invited@company.com",
          userName: "Invited Member",
          themePreference: "light",
          timestamp: Date.now(),
        })
      );

      (prisma.organizationInvitation.findUnique as unknown as Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3110/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ token: "invalid-token" }),
      });

      const res = await acceptInvitationRoute(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("INVITATION_NOT_FOUND");
    });

    it("fast-tracks member into organization and marks onboarding COMPLETED", async () => {
      const token = await signSessionToken(
        encodeSessionPayload({
          userId: "invited-user-456",
          email: "invited@company.com",
          userName: "Invited Member",
          themePreference: "light",
          timestamp: Date.now(),
        })
      );

      const expiresFuture = new Date(Date.now() + 86400000);
      (prisma.organizationInvitation.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "inv-1",
        token: "valid-test-token",
        organizationId: "org-joined-1",
        roleId: "role-member-1",
        status: "PENDING",
        expiresAt: expiresFuture,
        organization: { id: "org-joined-1", name: "Acme Global" },
        role: {
          id: "role-member-1",
          slug: "member",
          permissions: [],
        },
      });

      (prisma.userOrganization.upsert as unknown as Mock).mockResolvedValueOnce({});
      (prisma.userBranchRole.findFirst as unknown as Mock).mockResolvedValueOnce(null);
      (prisma.userBranchRole.create as unknown as Mock).mockResolvedValueOnce({});
      (prisma.organizationInvitation.update as unknown as Mock).mockResolvedValueOnce({});
      (prisma.user.findUnique as unknown as Mock).mockResolvedValueOnce({
        id: "invited-user-456",
        metadata: {},
      });
      (prisma.user.update as unknown as Mock).mockResolvedValueOnce({});

      const req = new NextRequest("http://localhost:3110/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ token: "valid-test-token" }),
      });

      const res = await acceptInvitationRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.redirectUrl).toBe("/dashboard");
    });
  });
});
