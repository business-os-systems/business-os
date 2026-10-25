import { describe, expect, it } from "vitest";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_CODES,
  PLATFORM_CAPABILITY_GROUPS,
  getPlatformCapability,
  isPlatformCapability,
} from "../src/index.js";

describe("@suite/core - Platform capability registry", () => {
  it("declares every capability with a prefix, a group and documentation", () => {
    expect(PLATFORM_CAPABILITY_CODES).toHaveLength(11);
    expect(new Set(PLATFORM_CAPABILITY_CODES).size).toBe(11);

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

  it("returns the definition for a registered capability", () => {
    const definition = getPlatformCapability("platform:audit:read");
    expect(definition.group).toBe("Governance");
    expect(definition.label).toBe("Read audit trail");
  });
});
