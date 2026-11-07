import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardTenantContext } from "@/services/tenant-context.service";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn<() => Promise<unknown>>(),
  findOrganization: vi.fn<() => Promise<unknown>>(),
  findInstalledApps: vi.fn<() => Promise<unknown[]>>(),
  findBranchRoles: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("@suite/db", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    organization: { findUnique: mocks.findOrganization },
    installedApp: { findMany: mocks.findInstalledApps },
    userBranchRole: {
      findMany: mocks.findBranchRoles,
      findFirst: vi.fn(),
    },
  },
}));

describe("tenant navigation entitlement filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads only enabled installed apps", async () => {
    mocks.findUser.mockResolvedValue(null);
    mocks.findOrganization.mockResolvedValue(null);
    mocks.findInstalledApps.mockResolvedValue([]);
    mocks.findBranchRoles.mockResolvedValue([]);

    await getDashboardTenantContext({
      userId: "usr_nav_1",
      email: "nav@enterprise.internal",
      userName: "Nav User",
      organizationId: "org_nav",
      organizationName: "Nav Org",
      role: "Member",
      permissions: [],
      timestamp: Date.now(),
    });

    expect(mocks.findInstalledApps).toHaveBeenCalledWith({
      where: { organizationId: "org_nav", isEnabled: true },
      orderBy: { installedAt: "asc" },
    });
  });
});
