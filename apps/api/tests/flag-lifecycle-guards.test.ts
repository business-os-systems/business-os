import { describe, expect, it } from "vitest";
import type { FeatureFlag } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { FLAG_ENVIRONMENTS } from "@suite/flags/contracts";
import {
  assertLifecycleComplete,
  assertNotExpiredWhenEnabled,
} from "../src/services/admin/flags.service.js";

function flag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: "flag_probe",
    key: "pos.offline_mode",
    name: "Offline mode",
    description: null,
    environment: FLAG_ENVIRONMENTS[0],
    isEnabled: false,
    defaultEnabled: false,
    owner: "platform@example.com",
    expiresAt: new Date(Date.now() + 86_400_000),
    removalTicket: "#224",
    version: 1,
    metadata: null,
    createdAt: new Date("2026-11-04T00:00:00Z"),
    updatedAt: new Date("2026-11-04T00:00:00Z"),
    ...overrides,
  };
}

function codeOf(work: () => void): string | undefined {
  try {
    work();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("Flag lifecycle guards", () => {
  it("allows a complete flag with a future expiry", () => {
    expect(
      codeOf(() => assertLifecycleComplete(flag(), { expectedVersion: 1 }))
    ).toBeUndefined();
  });

  it("refuses a legacy flag without an owner", () => {
    expect(
      codeOf(() =>
        assertLifecycleComplete(flag({ owner: null }), { expectedVersion: 1 })
      )
    ).toBe(PLATFORM_ERROR_CODE.FLAG_LIFECYCLE_INCOMPLETE);
  });

  it("refuses a legacy flag without an expiry", () => {
    expect(
      codeOf(() =>
        assertLifecycleComplete(flag({ expiresAt: null }), { expectedVersion: 1 })
      )
    ).toBe(PLATFORM_ERROR_CODE.FLAG_LIFECYCLE_INCOMPLETE);
  });

  it("refuses a legacy flag without a removal ticket", () => {
    expect(
      codeOf(() =>
        assertLifecycleComplete(flag({ removalTicket: null }), {
          expectedVersion: 1,
        })
      )
    ).toBe(PLATFORM_ERROR_CODE.FLAG_LIFECYCLE_INCOMPLETE);
  });

  it("accepts a legacy update that supplies the missing metadata", () => {
    expect(
      codeOf(() =>
        assertLifecycleComplete(flag({ owner: null }), {
          expectedVersion: 1,
          owner: "ops@example.com",
        })
      )
    ).toBeUndefined();
  });

  it("refuses to enable an expired flag", () => {
    expect(
      codeOf(() =>
        assertNotExpiredWhenEnabled(
          flag({ isEnabled: true, expiresAt: new Date(Date.now() - 60_000) }),
          { expectedVersion: 1 }
        )
      )
    ).toBe(PLATFORM_ERROR_CODE.FLAG_EXPIRED);
  });

  it("allows disabling an expired flag", () => {
    expect(
      codeOf(() =>
        assertNotExpiredWhenEnabled(
          flag({ isEnabled: true, expiresAt: new Date(Date.now() - 60_000) }),
          { expectedVersion: 1, isEnabled: false }
        )
      )
    ).toBeUndefined();
  });
});
