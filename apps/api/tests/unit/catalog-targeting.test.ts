import { describe, expect, it } from "vitest";
import {
  CATALOG_TARGETING_REASONS,
  isCatalogItemAvailable,
  resolveCatalogTargeting,
  type CatalogTargetingContext,
} from "../../src/services/admin/catalog-targeting.js";
import type { CatalogTargeting } from "../../src/services/admin/app-catalog.contract.js";

const EMPTY_TARGETING: CatalogTargeting = {
  plans: [],
  industries: [],
  orgAllowlist: [],
  orgDenylist: [],
};

const OPEN_CONTEXT: CatalogTargetingContext = {
  organizationId: "org_1",
  plan: "pro",
  industry: "hospitality",
  flagEnabled: null,
};

function targeting(overrides: Partial<CatalogTargeting>): CatalogTargeting {
  return { ...EMPTY_TARGETING, ...overrides };
}

function item(overrides: {
  status?: "DRAFT" | "ACTIVE" | "DEPRECATED" | "DISABLED" | "RETIRED";
  targeting?: CatalogTargeting;
  flagKey?: string | null;
}) {
  return {
    status: overrides.status ?? "ACTIVE",
    targeting: overrides.targeting ?? EMPTY_TARGETING,
    flagKey: overrides.flagKey ?? null,
  };
}

describe("catalog targeting lifecycle", () => {
  it("targets an active item with no filters", () => {
    expect(resolveCatalogTargeting(item({}), OPEN_CONTEXT)).toEqual({
      targeted: true,
      reason: CATALOG_TARGETING_REASONS.TARGETED,
    });
  });

  it("refuses any non-active lifecycle state", () => {
    for (const status of ["DRAFT", "DEPRECATED", "DISABLED", "RETIRED"] as const) {
      expect(resolveCatalogTargeting(item({ status }), OPEN_CONTEXT)).toEqual({
        targeted: false,
        reason: CATALOG_TARGETING_REASONS.NOT_ACTIVE,
      });
    }
  });
});

describe("catalog targeting plan and industry filters", () => {
  it("targets only the listed plans and fails closed without a plan", () => {
    const filtered = item({ targeting: targeting({ plans: ["pro", "scale"] }) });
    expect(resolveCatalogTargeting(filtered, OPEN_CONTEXT).targeted).toBe(true);
    expect(resolveCatalogTargeting(filtered, { ...OPEN_CONTEXT, plan: "starter" })).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.PLAN_MISMATCH,
    });
    expect(resolveCatalogTargeting(filtered, { ...OPEN_CONTEXT, plan: null })).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.PLAN_MISMATCH,
    });
  });

  it("targets only the listed industries and fails closed without one", () => {
    const filtered = item({
      targeting: targeting({ industries: ["hospitality", "restaurant"] }),
    });
    expect(resolveCatalogTargeting(filtered, OPEN_CONTEXT).targeted).toBe(true);
    expect(
      resolveCatalogTargeting(filtered, {
        ...OPEN_CONTEXT,
        industry: "retail",
      }),
    ).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.INDUSTRY_MISMATCH,
    });
    expect(resolveCatalogTargeting(filtered, { ...OPEN_CONTEXT, industry: null })).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.INDUSTRY_MISMATCH,
    });
  });
});

describe("catalog targeting organization lists", () => {
  it("targets only the explicit organization allowlist", () => {
    const filtered = item({
      targeting: targeting({ orgAllowlist: ["org_1", "org_2"] }),
    });
    expect(resolveCatalogTargeting(filtered, OPEN_CONTEXT).targeted).toBe(true);
    expect(
      resolveCatalogTargeting(filtered, {
        ...OPEN_CONTEXT,
        organizationId: "org_9",
      }),
    ).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.NOT_ALLOWLISTED,
    });
    expect(
      resolveCatalogTargeting(filtered, {
        ...OPEN_CONTEXT,
        organizationId: null,
      }),
    ).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.ORGANIZATION_REQUIRED,
    });
  });

  it("lets an explicit denylist win over the allowlist", () => {
    const filtered = item({
      targeting: targeting({
        orgAllowlist: ["org_1"],
        orgDenylist: ["org_1"],
      }),
    });
    expect(resolveCatalogTargeting(filtered, OPEN_CONTEXT)).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.DENYLISTED,
    });
  });
});

describe("catalog targeting without a tenant context", () => {
  it("targets an unfiltered item for an operator preview without a tenant", () => {
    expect(
      resolveCatalogTargeting(item({}), {
        organizationId: null,
        plan: null,
        industry: null,
        flagEnabled: null,
      }),
    ).toEqual({
      targeted: true,
      reason: CATALOG_TARGETING_REASONS.TARGETED,
    });
  });

  it("denies a denylisted tenant even when no allowlist exists", () => {
    const filtered = item({ targeting: targeting({ orgDenylist: ["org_1"] }) });

    expect(resolveCatalogTargeting(filtered, OPEN_CONTEXT)).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.DENYLISTED,
    });
    expect(
      resolveCatalogTargeting(filtered, {
        ...OPEN_CONTEXT,
        organizationId: "org_2",
      }).targeted,
    ).toBe(true);
  });
});

describe("catalog targeting flags and combined filters", () => {
  it("requires the declared feature flag to be enabled", () => {
    const flagged = item({ flagKey: "website-builder.section_presets" });
    expect(resolveCatalogTargeting(flagged, { ...OPEN_CONTEXT, flagEnabled: true }).targeted).toBe(
      true,
    );
    expect(resolveCatalogTargeting(flagged, { ...OPEN_CONTEXT, flagEnabled: false })).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.FLAG_DISABLED,
    });
    expect(resolveCatalogTargeting(flagged, { ...OPEN_CONTEXT, flagEnabled: null })).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.FLAG_DISABLED,
    });
  });

  it("combines filters and reports the first refusal", () => {
    const filtered = item({
      targeting: targeting({
        plans: ["pro"],
        industries: ["hospitality"],
        orgDenylist: ["org_1"],
      }),
    });
    expect(resolveCatalogTargeting(filtered, OPEN_CONTEXT)).toEqual({
      targeted: false,
      reason: CATALOG_TARGETING_REASONS.DENYLISTED,
    });
    expect(isCatalogItemAvailable(filtered, OPEN_CONTEXT)).toBe(false);
    expect(isCatalogItemAvailable(item({}), OPEN_CONTEXT)).toBe(true);
  });
});
