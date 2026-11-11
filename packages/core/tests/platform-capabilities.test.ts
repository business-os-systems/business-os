import { describe, expect, it } from "vitest";
import {
  PLATFORM_APPS_READ_CAPABILITIES,
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_CODES,
  PLATFORM_CAPABILITY_GROUPS,
  getPlatformCapability,
  hasPlatformAppsReadAccess,
  isPlatformCapability,
} from "../src/index.js";

describe("@suite/core - Platform capability registry", () => {
  it("declares every capability with a prefix, a group and documentation", () => {
    expect(PLATFORM_CAPABILITY_CODES).toHaveLength(14);
    expect(new Set(PLATFORM_CAPABILITY_CODES).size).toBe(14);
    expect(new Set(PLATFORM_CAPABILITY_CODES).size).toBe(14);

    for (const capability of Object.values(PLATFORM_CAPABILITIES)) {
      expect(capability.code).toMatch(/^platform:[a-z:]+$/);
      expect(PLATFORM_CAPABILITY_GROUPS).toContain(capability.group);
      expect(capability.label.length).toBeGreaterThan(0);
      expect(capability.description.length).toBeGreaterThan(0);
    }
  });

  it("recognizes registered capabilities and rejects unknown strings", () => {
    expect(isPlatformCapability("platform:tenants:read")).toBe(true);
    expect(isPlatformCapability("platform:unknown:read")).toBe(false);
    expect(isPlatformCapability("tenants:read")).toBe(false);
  });

  it("grants application read to the reader, the managers and catalog roles", () => {
    expect(PLATFORM_APPS_READ_CAPABILITIES).toEqual([
      "platform:apps:read",
      "platform:entitlements:manage",
      "platform:apps:author",
      "platform:apps:publish",
    ]);
    expect(hasPlatformAppsReadAccess([PLATFORM_CAPABILITIES.APPS_READ.code])).toBe(true);
    expect(hasPlatformAppsReadAccess([PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code])).toBe(true);
    expect(hasPlatformAppsReadAccess([PLATFORM_CAPABILITIES.APPS_AUTHOR.code])).toBe(true);
    expect(hasPlatformAppsReadAccess([PLATFORM_CAPABILITIES.APPS_PUBLISH.code])).toBe(true);
    expect(hasPlatformAppsReadAccess([PLATFORM_CAPABILITIES.TENANTS_READ.code])).toBe(false);
    expect(hasPlatformAppsReadAccess([])).toBe(false);
    expect(hasPlatformAppsReadAccess(undefined)).toBe(false);
  });

  it("returns the definition for a registered capability", () => {
    const definition = getPlatformCapability("platform:audit:read");
    expect(definition.group).toBe("Governance");
    expect(definition.label).toBe("Read audit trail");
  });
});
