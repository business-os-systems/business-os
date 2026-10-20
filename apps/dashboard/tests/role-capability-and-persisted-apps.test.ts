import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getDashboardTenantContext } from "@/services/tenant-context.service";
import { prisma } from "@suite/db";
import { hasPermission } from "@suite/core";

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      organization: {
        findUnique: vi.fn(),
      },
      installedApp: {
        findMany: vi.fn(),
      },
      userBranchRole: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
  };
});

describe("Principle VIII: Pure Capability Authorization & Zero Static Role Checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strictly enforces zero static role checks in tenant-context.service.ts", () => {
    const serviceFilePath = path.resolve(
      __dirname,
      "../src/services/tenant-context.service.ts"
    );
    const fileContent = fs.readFileSync(serviceFilePath, "utf8");

    // Prohibit role name string literals in authorization logic
    expect(fileContent).not.toMatch(/session\.role\s*===\s*["']owner["']/);
    expect(fileContent).not.toMatch(/slug\s*:\s*\{\s*in\s*:\s*\[["']owner["']/);
    expect(fileContent).not.toMatch(/roleName\s*===\s*["']Organization Owner["']/);
  });

  it("strictly enforces zero static role checks in login/route.ts", () => {
    const loginFilePath = path.resolve(
      __dirname,
      "../src/app/api/auth/login/route.ts"
    );
    const fileContent = fs.readFileSync(loginFilePath, "utf8");

    // Prohibit role name string literals being used to inject wildcard or bypass RBAC
    expect(fileContent).not.toMatch(/roleSlug\s*===\s*["']owner["']/);
    expect(fileContent).not.toMatch(/roleSlug\s*===\s*["']tenant-owner["']/);
    expect(fileContent).not.toMatch(/roleName\s*===\s*["']Organization Owner["']/);
  });

  it("resolves owner wildcard capability dynamically from database role_permissions", async () => {
    const mockSession = {
      userId: "usr_owner_1",
      email: "owner@enterprise.internal",
      userName: "Enterprise Owner",
      organizationId: "org_1",
      organizationName: "Enterprise Org",
      role: "Organization Owner",
      permissions: [], // Empty in session, forces DB resolution
      timestamp: Date.now(),
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "usr_owner_1",
      emailVerified: true,
    } as never);

    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: "org_1",
      name: "Enterprise Org",
      status: "ACTIVE",
    } as never);

    vi.mocked(prisma.installedApp.findMany).mockResolvedValueOnce([
      {
        id: "inst_1",
        organizationId: "org_1",
        appId: "website-builder",
        isEnabled: true,
        version: "1.0.0",
        installedAt: new Date(),
        updatedAt: new Date(),
        settings: {
          code: "App 01",
          name: "Website Builder",
          title: "Website Builder & Headless CMS",
          href: "/sites",
          iconName: "sites",
          description: "Visual canvas studio and storefront delivery.",
          permission: "cms:sites:read",
        },
      },
    ] as never);

    // Mock DB branch roles returning the wildcard (*) permission assigned via role_permissions
    vi.mocked(prisma.userBranchRole.findMany).mockResolvedValueOnce([
      {
        userId: "usr_owner_1",
        organizationId: "org_1",
        branchId: null,
        role: {
          name: "Organization Owner",
          slug: "owner",
          permissions: [
            {
              permission: {
                action: "*",
              },
            },
          ],
        },
      },
    ] as never);

    const result = await getDashboardTenantContext(mockSession);

    // Wildcard should be dynamically extracted from DB role_permissions
    expect(result.tenant.userPermissions).toContain("*");
    expect(hasPermission(result.tenant.userPermissions, "cms:sites:read")).toBe(true);
    expect(hasPermission(result.tenant.userPermissions, "core:organization:update")).toBe(true);
    expect(hasPermission(result.tenant.userPermissions, "custom:unforeseen:permission")).toBe(true);

    // Installed apps should load metadata directly from PostgreSQL settings
    expect(result.installedApps).toHaveLength(1);
    expect(result.installedApps[0]!.name).toBe("Website Builder & Headless CMS");
    expect(result.installedApps[0]!.href).toBe("/sites");
    expect(result.installedApps[0]!.permission).toBe("cms:sites:read");
    expect(result.installedApps[0]!.description).toBe("Visual canvas studio and storefront delivery.");
  });

  it("strictly respects scoped permissions for non-owner staff without wildcard", async () => {
    const mockSession = {
      userId: "usr_designer_1",
      email: "designer@enterprise.internal",
      userName: "Enterprise Designer",
      organizationId: "org_1",
      organizationName: "Enterprise Org",
      role: "Website Designer",
      permissions: ["cms:sites:read", "cms:pages:write"],
      timestamp: Date.now(),
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "usr_designer_1",
      emailVerified: true,
    } as never);

    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: "org_1",
      name: "Enterprise Org",
      status: "ACTIVE",
    } as never);

    vi.mocked(prisma.installedApp.findMany).mockResolvedValueOnce([
      {
        id: "inst_1",
        organizationId: "org_1",
        appId: "website-builder",
        isEnabled: true,
        version: "1.0.0",
        installedAt: new Date(),
        updatedAt: new Date(),
        settings: {
          code: "App 01",
          name: "Website Builder",
          title: "Website Builder & Headless CMS",
          href: "/sites",
          iconName: "sites",
          description: "Visual canvas studio and storefront delivery.",
          permission: "cms:sites:read",
        },
      },
    ] as never);

    const result = await getDashboardTenantContext(mockSession);

    expect(result.tenant.userPermissions).not.toContain("*");
    expect(hasPermission(result.tenant.userPermissions, "cms:sites:read")).toBe(true);
    expect(hasPermission(result.tenant.userPermissions, "core:organization:update")).toBe(false);
  });
});
