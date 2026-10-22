import { describe, expect, it } from "vitest";
import { evaluateFeatureFlag } from "../src/evaluation.js";
import type { FeatureFlagDefinition } from "../src/types.js";
import { RULE_TYPES } from "../src/types.js";

describe("Dynamic Feature Flag Evaluation (@suite/flags)", () => {
  const baseFlag: FeatureFlagDefinition = {
    key: "website_builder_v2",
    name: "Website Builder V2",
    environment: "development",
    isEnabled: true,
    defaultEnabled: false,
    version: 1,
    rules: [],
  };

  describe("Tier 1: Global Master Switch (Kill Switch)", () => {
    it("returns false immediately when isEnabled is false, overriding defaultEnabled: true", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        isEnabled: false,
        defaultEnabled: true,
      };

      const result = evaluateFeatureFlag(flag);
      expect(result).toBe(false);
    });

    it("returns false immediately when isEnabled is false, overriding active matching organization rules", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        isEnabled: false,
        defaultEnabled: false,
        rules: [
          {
            id: "rule_1",
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: "org_alpha",
            enabled: true,
            priority: 10,
          },
        ],
      };

      const result = evaluateFeatureFlag(flag, { organizationId: "org_alpha" });
      expect(result).toBe(false);
    });

    it("returns false immediately when isEnabled is false, overriding active matching environment rules", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        isEnabled: false,
        defaultEnabled: false,
        rules: [
          {
            id: "rule_env",
            ruleType: RULE_TYPES.ENVIRONMENT,
            targetId: "staging",
            enabled: true,
            priority: 10,
          },
        ],
      };

      const result = evaluateFeatureFlag(flag, { environment: "staging" });
      expect(result).toBe(false);
    });
  });

  describe("Tier 2: Environment Targeting Rules", () => {
    it("evaluates to true when an environment targeting rule matches context.environment", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: false,
        rules: [
          {
            id: "rule_env",
            ruleType: RULE_TYPES.ENVIRONMENT,
            targetId: "staging",
            enabled: true,
            priority: 5,
          },
        ],
      };

      const result = evaluateFeatureFlag(flag, { environment: "staging" });
      expect(result).toBe(true);
    });

    it("takes precedence over organization targeting rules", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: false,
        rules: [
          {
            id: "rule_env_disabled",
            ruleType: RULE_TYPES.ENVIRONMENT,
            targetId: "production",
            enabled: false,
            priority: 1,
          },
          {
            id: "rule_org_enabled",
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: "org_beta",
            enabled: true,
            priority: 10,
          },
        ],
      };

      // Environment rule says false, org rule says true -> Environment wins in 4-tier precedence
      const result = evaluateFeatureFlag(flag, {
        environment: "production",
        organizationId: "org_beta",
      });
      expect(result).toBe(false);
    });
  });

  describe("Tier 3: Organization Targeting Rules", () => {
    it("evaluates to true when an organization rule enables the feature for a specific tenant", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: false,
        rules: [
          {
            id: "rule_org_alpha",
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: "org_alpha",
            enabled: true,
            priority: 0,
          },
        ],
      };

      const resultAlpha = evaluateFeatureFlag(flag, { organizationId: "org_alpha" });
      expect(resultAlpha).toBe(true);

      const resultOther = evaluateFeatureFlag(flag, { organizationId: "org_gamma" });
      expect(resultOther).toBe(false);
    });

    it("evaluates to false when an organization rule explicitly disables the feature despite defaultEnabled: true", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: true,
        rules: [
          {
            id: "rule_org_blocked",
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: "org_blocked",
            enabled: false,
            priority: 0,
          },
        ],
      };

      const result = evaluateFeatureFlag(flag, { organizationId: "org_blocked" });
      expect(result).toBe(false);
    });

    it("selects the highest priority rule when multiple rules match the same target", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: false,
        rules: [
          {
            id: "rule_low_prio",
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: "org_delta",
            enabled: false,
            priority: 1,
          },
          {
            id: "rule_high_prio",
            ruleType: RULE_TYPES.ORGANIZATION,
            targetId: "org_delta",
            enabled: true,
            priority: 10,
          },
        ],
      };

      const result = evaluateFeatureFlag(flag, { organizationId: "org_delta" });
      expect(result).toBe(true);
    });
  });

  describe("Tier 4: Default Fallback State", () => {
    it("returns defaultEnabled: true when no targeting rules match", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: true,
        rules: [],
      };

      const result = evaluateFeatureFlag(flag, { organizationId: "org_unmatched" });
      expect(result).toBe(true);
    });

    it("returns defaultEnabled: false when no targeting rules match", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: false,
        rules: [],
      };

      const result = evaluateFeatureFlag(flag, { organizationId: "org_unmatched" });
      expect(result).toBe(false);
    });
  });

  describe("Fail-Closed Boundary & Nil Safety", () => {
    it("safely defaults to false when flag is null", () => {
      expect(evaluateFeatureFlag(null)).toBe(false);
    });

    it("safely defaults to false when flag is undefined", () => {
      expect(evaluateFeatureFlag(undefined)).toBe(false);
    });

    it("handles flags with undefined rules array safely", () => {
      const flag: FeatureFlagDefinition = {
        ...baseFlag,
        defaultEnabled: true,
        rules: undefined,
      };

      expect(evaluateFeatureFlag(flag)).toBe(true);
    });
  });
});
