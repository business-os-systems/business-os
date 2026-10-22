/**
 * Authoritative Types & Contracts for Dynamic Multi-Tenant Feature Flags
 * (@suite/flags)
 */

export const RULE_TYPES = {
  ORGANIZATION: "ORGANIZATION",
  ENVIRONMENT: "ENVIRONMENT",
} as const;

export type RuleType = (typeof RULE_TYPES)[keyof typeof RULE_TYPES];

export interface FlagEvaluationContext {
  environment?: string;
  organizationId?: string;
  userId?: string;
}

export interface FeatureFlagRuleDefinition {
  id: string;
  ruleType: RuleType | string;
  targetId: string;
  enabled: boolean;
  priority: number;
}

export interface FeatureFlagDefinition {
  key: string;
  name: string;
  description?: string | null;
  environment: string;
  isEnabled: boolean; // Global kill switch
  defaultEnabled: boolean; // Default fallback
  version: number;
  metadata?: Record<string, unknown> | null;
  rules?: FeatureFlagRuleDefinition[];
}

export interface IFeatureFlagClient {
  /**
   * Evaluates whether a feature flag is enabled for the provided context.
   * Resolves in <5ms via Redis cache, falling back to PostgreSQL.
   * Returns false (fail-closed) if flag does not exist or an error occurs.
   */
  isEnabled(flagKey: string, context?: FlagEvaluationContext): Promise<boolean>;

  /**
   * Retrieves full flag definition including active rules and metadata.
   */
  getFlag(flagKey: string, environment?: string): Promise<FeatureFlagDefinition | null>;

  /**
   * Invalidates Redis cache for a specific flag across environments.
   */
  invalidateCache(flagKey: string, environment?: string): Promise<void>;
}
