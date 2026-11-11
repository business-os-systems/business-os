import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@suite/core";

const mocks = vi.hoisted(() => ({
  findInstalledApp: vi.fn(),
  resolveEffectivePermissions: vi.fn(),
}));

vi.mock("@suite/db", () => ({
  prisma: {
    installedApp: { findFirst: mocks.findInstalledApp },
  },
}));

vi.mock("@/services/effective-permissions.service", () => ({
  resolveEffectivePermissions: mocks.resolveEffectivePermissions,
}));

import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";

const SESSION = {
  userId: "usr_wb_1",
  organizationId: "org_wb_1",
  permissions: [PERMISSIONS.WILDCARD],
};

const SITES_READ = PERMISSIONS.WEBSITE_BUILDER.SITES_READ;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveEffectivePermissions.mockResolvedValue([PERMISSIONS.WILDCARD]);
});

describe("Website Builder installation entitlement", () => {
  it("denies a tenant without the installed application", async () => {
    mocks.findInstalledApp.mockResolvedValue(null);

    const result = await evaluateWebsiteBuilderAccess({
      actor: SESSION,
      capability: SITES_READ,
    });

    expect(result).toEqual({ kind: "denied", reason: "app_not_installed" });
    expect(mocks.findInstalledApp).toHaveBeenCalledWith({
      where: {
        organizationId: SESSION.organizationId,
        appId: "website-builder",
        isEnabled: true,
      },
      select: { id: true },
    });
  });

  it("denies a tenant whose installation is disabled", async () => {
    mocks.findInstalledApp.mockResolvedValue(null);

    const result = await evaluateWebsiteBuilderAccess({
      actor: SESSION,
      capability: SITES_READ,
    });

    expect(result).toEqual({ kind: "denied", reason: "app_not_installed" });
  });

  it("fails closed when the entitlement read is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findInstalledApp.mockRejectedValue(new Error("database offline"));

    const result = await evaluateWebsiteBuilderAccess({
      actor: SESSION,
      capability: SITES_READ,
    });

    expect(result).toEqual({
      kind: "denied",
      reason: "entitlements_unavailable",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("Website Builder capability entitlement", () => {
  beforeEach(() => {
    mocks.findInstalledApp.mockResolvedValue({ id: "app_1" });
  });

  it("fails closed when capability resolution is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.resolveEffectivePermissions.mockRejectedValue(new Error("claims offline"));

    const result = await evaluateWebsiteBuilderAccess({
      actor: SESSION,
      capability: SITES_READ,
    });

    expect(result).toEqual({
      kind: "denied",
      reason: "entitlements_unavailable",
    });
    consoleError.mockRestore();
  });

  it("denies a member without cms:sites:read", async () => {
    mocks.resolveEffectivePermissions.mockResolvedValue([
      PERMISSIONS.CORE.ORGANIZATION_READ,
    ]);

    const result = await evaluateWebsiteBuilderAccess({
      actor: { ...SESSION, permissions: [PERMISSIONS.CORE.ORGANIZATION_READ] },
      capability: SITES_READ,
    });

    expect(result).toEqual({ kind: "denied", reason: "capability_denied" });
  });

  it("grants access when the installation and capability are present", async () => {
    const result = await evaluateWebsiteBuilderAccess({
      actor: SESSION,
      capability: SITES_READ,
    });

    expect(result).toEqual({
      kind: "granted",
      permissions: [PERMISSIONS.WILDCARD],
    });
  });

  it("treats an empty permission set as denied, never as unrestricted", async () => {
    mocks.resolveEffectivePermissions.mockResolvedValue([]);

    const result = await evaluateWebsiteBuilderAccess({
      actor: { ...SESSION, permissions: [] },
      capability: SITES_READ,
    });

    expect(result).toEqual({ kind: "denied", reason: "capability_denied" });
  });
});
