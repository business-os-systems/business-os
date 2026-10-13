import { describe, it, expect, beforeEach } from "vitest";
import {
  createTenantPrismaClient,
  TenantIsolationViolationError,
  prisma,
} from "@suite/db";
import { createApp } from "../../src/app.js";

describe("Integration: Multi-Tenant Leak Defense", () => {
  const app = createApp({ enableRateLimiting: false });

  const TENANT_A_ID = "org_tenant_alpha_111";
  const TENANT_B_ID = "org_tenant_bravo_222";
  const BRANCH_A_ID = "branch_alpha_delhi_111";
  const BRANCH_B_ID = "branch_bravo_mumbai_222";

  beforeEach(async () => {
    // Clean up test tenants if existing
    await prisma.branch.deleteMany({
      where: { id: { in: [BRANCH_A_ID, BRANCH_B_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [TENANT_A_ID, TENANT_B_ID] } },
    });

    // Seed Tenant A (Alpha)
    await prisma.organization.create({
      data: {
        id: TENANT_A_ID,
        name: "Alpha Grand Hotel",
        slug: "alpha-grand-hotel",
        currency: "INR",
        country: "IN",
        branches: {
          create: {
            id: BRANCH_A_ID,
            name: "Alpha Delhi Central",
            code: "ADC-01",
            type: "HOTEL",
            timezone: "Asia/Kolkata",
          },
        },
      },
    });

    // Seed Tenant B (Bravo)
    await prisma.organization.create({
      data: {
        id: TENANT_B_ID,
        name: "Bravo Luxury Resorts",
        slug: "bravo-luxury-resorts",
        currency: "INR",
        country: "IN",
        branches: {
          create: {
            id: BRANCH_B_ID,
            name: "Bravo Mumbai Marina",
            code: "BMM-01",
            type: "RESORT",
            timezone: "Asia/Kolkata",
          },
        },
      },
    });
  });

  describe("ORM Layer Tenant Isolation ($extends)", () => {
    it("transparently scopes queries so Tenant A cannot see Tenant B branches", async () => {
      const tenantAClient = createTenantPrismaClient(prisma, {
        organizationId: TENANT_A_ID,
      });
      const branches = await tenantAClient.branch.findMany();

      expect(branches).toHaveLength(1);
      expect(branches[0]?.id).toBe(BRANCH_A_ID);
      expect(branches[0]?.organizationId).toBe(TENANT_A_ID);

      const hasTenantB = branches.some((b: { organizationId: string }) => b.organizationId === TENANT_B_ID);
      expect(hasTenantB).toBe(false);
    });

    it("throws TenantIsolationViolationError when Tenant A attempts findUniqueOrThrow on Tenant B branch", async () => {
      const tenantAClient = createTenantPrismaClient(prisma, {
        organizationId: TENANT_A_ID,
      });

      await expect(
        tenantAClient.branch.findUniqueOrThrow({
          where: { id: BRANCH_B_ID },
        })
      ).rejects.toThrow(TenantIsolationViolationError);
    });

    it("prevents Tenant A from mutating Tenant B branch", async () => {
      const tenantAClient = createTenantPrismaClient(prisma, {
        organizationId: TENANT_A_ID,
      });

      await expect(
        tenantAClient.branch.update({
          where: { id: BRANCH_B_ID },
          data: { name: "Hacked Branch Name" },
        })
      ).rejects.toThrow(TenantIsolationViolationError);
    });
  });

  describe("API Gateway Tenant Defense", () => {
    it("returns 404 for non-existent or foreign organization ID lookup", async () => {
      const res = await app.request("/api/v1/organizations/org_non_existent_tenant_999");
      expect(res.status).toBe(404);

      interface ErrorResponse {
        code: string;
        title: string;
      }
      const body = (await res.json()) as ErrorResponse;
      expect(body.code).toBe("ORGANIZATION_NOT_FOUND");
    });

    it("fetches correct tenant details without leaking foreign tenant configuration", async () => {
      const resA = await app.request(`/api/v1/organizations/${TENANT_A_ID}`);
      expect(resA.status).toBe(200);

      interface OrgResponse {
        success: boolean;
        data: { id: string; name: string; branches: Array<{ id: string }> };
      }
      const bodyA = (await resA.json()) as OrgResponse;
      expect(bodyA.data.id).toBe(TENANT_A_ID);
      expect(bodyA.data.name).toBe("Alpha Grand Hotel");
      expect(bodyA.data.branches[0]?.id).toBe(BRANCH_A_ID);

      const leaksTenantB = bodyA.data.branches.some((b) => b.id === BRANCH_B_ID);
      expect(leaksTenantB).toBe(false);
    });

    it("rejects GET /api/v1/branches when organizationId context is missing", async () => {
      const res = await app.request("/api/v1/branches");
      expect(res.status).toBe(422);
    });

    it("scopes GET /api/v1/branches strictly to requesting tenant without leaking foreign branches", async () => {
      const res = await app.request(`/api/v1/branches?organizationId=${TENANT_A_ID}`);
      expect(res.status).toBe(200);

      interface BranchListResponse {
        success: boolean;
        data: Array<{ id: string; organizationId: string }>;
      }
      const body = (await res.json()) as BranchListResponse;
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((b) => b.organizationId === TENANT_A_ID)).toBe(true);
      expect(body.data.some((b) => b.id === BRANCH_B_ID)).toBe(false);
    });

    it("returns 404 when requesting a foreign branch with x-organization-id header set", async () => {
      const res = await app.request(`/api/v1/branches/${BRANCH_B_ID}`, {
        headers: { "x-organization-id": TENANT_A_ID },
      });
      expect(res.status).toBe(404);
    });
  });
});
