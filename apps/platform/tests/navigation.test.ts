import { describe, expect, it } from "vitest";
import { PLATFORM_CAPABILITY_CODES } from "@suite/core";
import {
  PLATFORM_NAV_ITEMS,
  canAccessPath,
  requiredCapabilityForPath,
  visibleNavigation,
} from "../src/components/layout/navigation.config.js";

describe("Platform navigation", () => {
  it("does not show gated destinations without capabilities", () => {
    expect(visibleNavigation([])).toEqual([]);
  });

  it("shows only granted capabilities", () => {
    expect(
      visibleNavigation(["platform:tenants:read"] as const).map((item) => item.id)
    ).toEqual(["tenants"]);
    expect(
      visibleNavigation([
        "platform:telemetry:read",
        "platform:tenants:read",
      ] as const).map((item) => item.id)
    ).toEqual(["overview", "tenants", "system"]);
  });

  it("gates every destination with a registered capability", () => {
    const registered = new Set(PLATFORM_CAPABILITY_CODES);
    for (const item of PLATFORM_NAV_ITEMS) {
      expect(registered.has(item.capability)).toBe(true);
      expect(requiredCapabilityForPath(item.href)).toBe(item.capability);
    }
  });

  it("resolves nested destinations to their top-level capability", () => {
    expect(requiredCapabilityForPath("/tenants/org_1")).toBe(
      "platform:tenants:read"
    );
    expect(requiredCapabilityForPath("/tenants/org_1/settings")).toBe(
      "platform:tenants:read"
    );
    expect(requiredCapabilityForPath("/not-a-destination")).toBeNull();
  });

  it("denies a destination when its gating capability is missing", () => {
    expect(canAccessPath([], "/")).toBe(false);
    expect(canAccessPath(["platform:tenants:read"], "/")).toBe(false);
    expect(canAccessPath(["platform:tenants:read"], "/tenants/org_1")).toBe(
      true
    );
    expect(canAccessPath(["platform:telemetry:read"], "/")).toBe(true);
    expect(canAccessPath(["platform:tenants:read"], "/not-a-destination")).toBe(
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
