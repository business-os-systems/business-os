import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma,
  createTenantPrismaClient,
  TenantIsolationViolationError,
  seed,
} from "../src/index.js";

const TEST_ORG_A_ID = "org_test_tenant_a";
const TEST_ORG_B_ID = "org_test_tenant_b";
const TEST_BRANCH_A1_ID = "branch_test_a1";
const TEST_BRANCH_B1_ID = "branch_test_b1";

describe("Platform Core Database & Multi-Tenant Isolation (@suite/db)", () => {
  beforeAll(async () => {
    // Clean up test tenants if existing
    await prisma.appBranchConfig.deleteMany({
      where: { organizationId: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.branch.deleteMany({
      where: { organizationId: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });

    // Create Tenant A
    await prisma.organization.create({
      data: {
        id: TEST_ORG_A_ID,
        name: "Test Tenant Alpha",
        slug: "test-tenant-alpha",
        currency: "INR",
        country: "IN",
      },
    });

    // Create Tenant B
    await prisma.organization.create({
      data: {
        id: TEST_ORG_B_ID,
        name: "Test Tenant Beta",
        slug: "test-tenant-beta",
        currency: "USD",
        country: "US",
      },
    });

    // Create Branches for Tenant A
    await prisma.branch.create({
      data: {
        id: TEST_BRANCH_A1_ID,
        organizationId: TEST_ORG_A_ID,
        code: "ALPHA-MAIN",
        name: "Alpha Main Branch",
        type: "hotel",
        nightAuditHour: 4,
      },
    });

    // Create Branches for Tenant B
    await prisma.branch.create({
      data: {
        id: TEST_BRANCH_B1_ID,
        organizationId: TEST_ORG_B_ID,
        code: "BETA-MAIN",
        name: "Beta Main Branch",
        type: "restaurant",
        nightAuditHour: 4,
      },
    });
  });

  afterAll(async () => {
    // Teardown test entities
    await prisma.appBranchConfig.deleteMany({
      where: { organizationId: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.branch.deleteMany({
      where: { organizationId: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.$disconnect();
  });

  it("transparently scopes findMany queries to current tenant", async () => {
    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    const branchesA = await clientA.branch.findMany();
    expect(branchesA.length).toBe(1);
    expect(branchesA[0]?.id).toBe(TEST_BRANCH_A1_ID);
    expect(branchesA[0]?.organizationId).toBe(TEST_ORG_A_ID);

    const clientB = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_B_ID,
    });

    const branchesB = await clientB.branch.findMany();
    expect(branchesB.length).toBe(1);
    expect(branchesB[0]?.id).toBe(TEST_BRANCH_B1_ID);
    expect(branchesB[0]?.organizationId).toBe(TEST_ORG_B_ID);
  });

  it("prevents cross-tenant leaks on findUnique seeks", async () => {
    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    // Attempting to query Tenant B's branch using Tenant A's client
    const branchOfB = await clientA.branch.findUnique({
      where: { id: TEST_BRANCH_B1_ID },
    });

    // Must return null, not leaking Tenant B's record
    expect(branchOfB).toBeNull();
  });

  it("throws TenantIsolationViolationError on findUniqueOrThrow across tenants", async () => {
    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    await expect(
      clientA.branch.findUniqueOrThrow({
        where: { id: TEST_BRANCH_B1_ID },
      })
    ).rejects.toThrow(TenantIsolationViolationError);
  });

  it("auto-injects organizationId on create operations", async () => {
    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    // Provide a mismatched organizationId to verify the extension enforces clientA's organizationId
    const newBranch = await clientA.branch.create({
      data: {
        organizationId: TEST_ORG_B_ID,
        code: "ALPHA-SUB",
        name: "Alpha Sub Outlet",
        type: "cafe",
        nightAuditHour: 4,
      },
    });

    expect(newBranch.organizationId).toBe(TEST_ORG_A_ID);
    expect(newBranch.code).toBe("ALPHA-SUB");

    // Clean up
    await prisma.branch.delete({ where: { id: newBranch.id } });
  });

  it("scopes queries by branchId when branchId is present in context", async () => {
    const clientAWithBranch = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A1_ID,
    });

    // Create an AppBranchConfig with mismatched ids to verify context enforcement
    const config = await clientAWithBranch.appBranchConfig.create({
      data: {
        organizationId: TEST_ORG_B_ID,
        branchId: TEST_BRANCH_B1_ID,
        appId: "lodging_pms",
        isEnabled: true,
      },
    });

    expect(config.organizationId).toBe(TEST_ORG_A_ID);
    expect(config.branchId).toBe(TEST_BRANCH_A1_ID);

    const found = await clientAWithBranch.appBranchConfig.findMany();
    expect(found.length).toBe(1);
    expect(found[0]?.branchId).toBe(TEST_BRANCH_A1_ID);

    // Clean up
    await prisma.appBranchConfig.delete({ where: { id: config.id } });
  });

  it("blocks tenants from creating new Organization roots", async () => {
    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    await expect(
      clientA.organization.create({
        data: {
          name: "Rogue Org",
          slug: "rogue-org",
        },
      })
    ).rejects.toThrow(TenantIsolationViolationError);
  });

  it("prevents mutating records belonging to another tenant", async () => {
    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    await expect(
      clientA.branch.update({
        where: { id: TEST_BRANCH_B1_ID },
        data: { name: "Hijacked Branch" },
      })
    ).rejects.toThrow(TenantIsolationViolationError);
  });

  it("allows tenant client to read global system roles", async () => {
    // Run seed to ensure system roles are available
    await seed();

    const clientA = createTenantPrismaClient(prisma, {
      organizationId: TEST_ORG_A_ID,
    });

    const roles = await clientA.role.findMany();
    expect(roles.length).toBeGreaterThan(0);
    const ownerRole = roles.find((r) => r.slug === "tenant-owner");
    expect(ownerRole).toBeDefined();
    expect(ownerRole?.isSystem).toBe(true);
  });

  it("executes seed idempotently without throwing errors on duplicate run", async () => {
    // Running seed a second time should succeed with zero errors (all upsert operations)
    await expect(seed()).resolves.not.toThrow();

    const masterOrg = await prisma.organization.findUnique({
      where: { id: "org_system_master" },
    });
    expect(masterOrg).toBeDefined();

    const riverview = await prisma.organization.findUnique({
      where: { id: "org_riverview_hospitality" },
      include: { branches: true, installedApps: true },
    });
    expect(riverview).toBeDefined();
    expect(riverview?.branches.length).toBe(3);
    expect(riverview?.installedApps.length).toBe(3);
  });
});
