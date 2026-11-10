import { describe, expect, it } from "vitest";
import { PLATFORM_CAPABILITIES, PLATFORM_CAPABILITY_CODES } from "@suite/core";
import {
  PLATFORM_NAV_ITEMS,
  canAccessPath,
  requiredCapabilitiesForPath,
  visibleNavigation,
} from "../src/components/layout/navigation.config.js";

const APPS_READ = PLATFORM_CAPABILITIES.APPS_READ.code;
const TENANTS_READ = PLATFORM_CAPABILITIES.TENANTS_READ.code;
const TELEMETRY_READ = PLATFORM_CAPABILITIES.TELEMETRY_READ.code;
const ENTITLEMENTS_MANAGE = PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code;

describe("Platform navigation", () => {
  it("does not show gated destinations without capabilities", () => {
    expect(visibleNavigation([])).toEqual([]);
  });

  it("shows only granted capabilities", () => {
    expect(
      visibleNavigation([TENANTS_READ] as const).map((item) => item.id)
    ).toEqual(["tenants"]);
    expect(
      visibleNavigation([APPS_READ] as const).map((item) => item.id)
    ).toEqual(["apps"]);
    expect(
      visibleNavigation([ENTITLEMENTS_MANAGE] as const).map((item) => item.id)
    ).toEqual(["apps"]);
    expect(
      visibleNavigation([TELEMETRY_READ, TENANTS_READ] as const).map(
        (item) => item.id
      )
    ).toEqual(["overview", "tenants", "system"]);
  });

  it("gates every destination with a registered capability", () => {
    const registered = new Set(PLATFORM_CAPABILITY_CODES);
    for (const item of PLATFORM_NAV_ITEMS) {
      for (const capability of item.capabilities) {
        expect(registered.has(capability)).toBe(true);
      }
      expect(requiredCapabilitiesForPath(item.href)).toEqual(
        item.capabilities
      );
    }
  });

});

describe("Platform path gating", () => {
  it("resolves nested destinations to their top-level capability", () => {
    expect(requiredCapabilitiesForPath("/tenants/org_1")).toEqual([
      TENANTS_READ,
    ]);
    expect(requiredCapabilitiesForPath("/tenants/org_1/settings")).toEqual([
      TENANTS_READ,
    ]);
    expect(requiredCapabilitiesForPath("/apps/website-builder")).toEqual([
      APPS_READ,
      ENTITLEMENTS_MANAGE,
    ]);
    expect(
      requiredCapabilitiesForPath("/apps/website-builder/overview")
    ).toEqual([APPS_READ, ENTITLEMENTS_MANAGE]);
    expect(requiredCapabilitiesForPath("/not-a-destination")).toEqual([]);
  });

  it("denies a destination when its gating capability is missing", () => {
    expect(canAccessPath([], "/")).toBe(false);
    expect(canAccessPath([TENANTS_READ], "/")).toBe(false);
    expect(canAccessPath([TENANTS_READ], "/tenants/org_1")).toBe(
      true
    );
    expect(canAccessPath([TELEMETRY_READ], "/")).toBe(true);
    expect(canAccessPath([TELEMETRY_READ], "/system")).toBe(true);
    expect(canAccessPath([TENANTS_READ], "/system")).toBe(false);
    expect(canAccessPath([ENTITLEMENTS_MANAGE], "/apps")).toBe(true);
    expect(canAccessPath([APPS_READ], "/apps")).toBe(true);
    expect(
      canAccessPath([ENTITLEMENTS_MANAGE], "/apps/website-builder/overview")
    ).toBe(true);
    expect(
      canAccessPath([APPS_READ], "/apps/website-builder/overview")
    ).toBe(true);
    expect(
      canAccessPath([], "/apps/website-builder/unknown-destination")
    ).toBe(false);
    expect(
      canAccessPath([APPS_READ], "/apps/website-builder/unknown-destination")
    ).toBe(false);
    expect(canAccessPath([TENANTS_READ], "/not-a-destination")).toBe(
      false
    );
  });

  it("does not contain tenant-workspace routes", () => {
    for (const item of PLATFORM_NAV_ITEMS) {
      expect(item.href).not.toMatch(
        /^\/(dashboard|settings|onboarding|choose-tenant|workspace)(\/|$)/
      );
    }
  });
});
