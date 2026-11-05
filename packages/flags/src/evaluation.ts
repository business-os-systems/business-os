import type { FeatureFlagDefinition, FeatureFlagRuleDefinition, FlagEvaluationContext } from "./types.js";
import { isFlagExpired, RULE_TYPES } from "./types.js";

/**
 * Deterministically evaluates a feature flag using 4-tier precedence:
 * Tier 1: Global Master Switch (Kill switch overrides all)
 * Tier 2: Environment Targeting Rule
 * Tier 3: Organization Targeting Rule
 * Tier 4: Default Fallback State
 *
 * Guaranteed fail-closed: returns false if flag is missing or disabled.
 */
export function evaluateFeatureFlag(
  flag: FeatureFlagDefinition | null | undefined,
  context: FlagEvaluationContext = {}
): boolean {
  if (!flag) {
    return false;
  }

  // Tier 1: Global Master Switch (Kill switch) and the expiry fence. An
  // expired flag is off even when its switch was left enabled.
  if (!flag.isEnabled || isFlagExpired(flag.expiresAt)) {
    return false;
  }

  const rules = flag.rules ?? [];

  // Tier 2: Environment Targeting Rule
  if (context.environment) {
    const envRule = findHighestPriorityRule(rules, RULE_TYPES.ENVIRONMENT, context.environment);
    if (envRule) {
      return envRule.enabled;
    }
  }

  // Tier 3: Organization Targeting Rule
  if (context.organizationId) {
    const orgRule = findHighestPriorityRule(rules, RULE_TYPES.ORGANIZATION, context.organizationId);
    if (orgRule) {
      return orgRule.enabled;
    }
  }

  // Tier 4: Default Fallback State
  return flag.defaultEnabled;
}

function findHighestPriorityRule(
  rules: FeatureFlagRuleDefinition[],
  ruleType: string,
  targetId: string
): FeatureFlagRuleDefinition | undefined {
  const matches = rules
    .filter((r) => r.ruleType === ruleType && r.targetId === targetId)
    .sort((a, b) => b.priority - a.priority);

  return matches[0];
}
