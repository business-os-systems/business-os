import { beforeEach, describe, expect, it, vi } from "vitest";
import { partiallyMatches } from "./expect-matchers";
import { PERMISSIONS } from "@suite/core";
import {
  installApplication,
  listInstalledApps,
} from "../../src/services/installed-apps.service";

const dbMocks = vi.hoisted(() => ({
  prisma: {
    installedApp: { findMany: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
    userBranchRole: { findMany: vi.fn() },
  },
}));

vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));

const APP_ID = "website-builder";
const INSTALLED_AT = new Date("2026-01-01T00:00:00.000Z");
const INSTALLED_RECORD = {
  id: "inst_1",
  organizationId: "org_1",
  appId: APP_ID,
  version: "1.0.0",
  isEnabled: true,
  installedAt: INSTALLED_AT,
  settings: {
    code: "App 01",
    name: "Website Builder",
    title: "Website Builder & Headless CMS",
    href: "/sites",
    iconName: "sites",
    description: "Visual canvas studio.",
    permission: "cms:sites:read",
  },
};

describe("installed apps query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps persisted settings to the installed app DTO", async () => {
    dbMocks.prisma.installedApp.findMany.mockResolvedValueOnce([INSTALLED_RECORD]);

    const apps = await listInstalledApps("org_1");

    expect(apps).toEqual([
      {
        id: "inst_1",
        appId: APP_ID,
        name: "Website Builder",
        title: "Website Builder & Headless CMS",
        code: "App 01",
        description: "Visual canvas studio.",
        href: "/sites",
        iconName: "sites",
        permission: "cms:sites:read",
        version: "1.0.0",
        isEnabled: true,
        installedAt: INSTALLED_AT.toISOString(),
      },
    ]);
    expect(dbMocks.prisma.installedApp.findMany).toHaveBeenCalledWith(
      partiallyMatches({ where: { organizationId: "org_1", isEnabled: true } })
    );
  });
});

describe("application installation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses installation until the installer verifies their email", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", emailVerified: false });

    await expect(
      installApplication({
        organizationId: "org_1",
        appId: APP_ID,
        userId: "usr_1",
        sessionPermissions: [PERMISSIONS.APPS.INSTALL],
      })
    ).resolves.toEqual({ status: "email_unverified" });
    expect(dbMocks.prisma.installedApp.upsert).not.toHaveBeenCalled();
  });

  it("refuses installation without the apps:install capability", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", emailVerified: true });
    dbMocks.prisma.userBranchRole.findMany.mockResolvedValueOnce([
      { role: { permissions: [] } },
    ]);

    await expect(
      installApplication({
        organizationId: "org_1",
        appId: APP_ID,
        userId: "usr_1",
        sessionPermissions: ["cms:sites:read"],
      })
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("upserts an enabled installed app for a verified, permitted installer", async () => {
    dbMocks.prisma.user.findUnique.mockResolvedValueOnce({ id: "usr_1", emailVerified: true });
    dbMocks.prisma.installedApp.upsert.mockResolvedValueOnce(INSTALLED_RECORD);

    const result = await installApplication({
      organizationId: "org_1",
      appId: APP_ID,
      userId: "usr_1",
      sessionPermissions: [PERMISSIONS.APPS.INSTALL],
    });

    expect(result).toEqual({
      status: "installed",
      appId: APP_ID,
      installedAt: INSTALLED_AT,
    });
    expect(dbMocks.prisma.installedApp.upsert).toHaveBeenCalledWith(
      partiallyMatches({
        where: { organizationId_appId: { organizationId: "org_1", appId: APP_ID } },
        update: { isEnabled: true },
      })
    );
  });
});
