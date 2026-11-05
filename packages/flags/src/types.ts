/**
 * Authoritative Types & Contracts for Dynamic Multi-Tenant Feature Flags
 * (@suite/flags)
 */

export const FLAG_ENVIRONMENTS = ["development", "staging", "production"] as const;

export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];

export const FLAG_PAGE_LIMIT = { default: 50, max: 100 } as const;

export const RULE_TYPES = {
  ORGANIZATION: "ORGANIZATION",
  ENVIRONMENT: "ENVIRONMENT",
} as const;

export type RuleType = (typeof RULE_TYPES)[keyof typeof RULE_TYPES];

export const FLAG_RULE_TYPES = [RULE_TYPES.ORGANIZATION, RULE_TYPES.ENVIRONMENT] as const;

export type FlagRuleType = (typeof FLAG_RULE_TYPES)[number];

/**
 * The one expiry decision for API, evaluation and UI validation. An invalid
 * timestamp fails closed.
 */
export function isFlagExpired(
  expiresAt: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  if (expiresAt === null || expiresAt === undefined) {
    return false;
  }
  const timestamp =
    expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isNaN(timestamp) ? true : timestamp <= now;
}

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
  /** ISO 8601 expiry; an expired flag always evaluates to false (OP-8). */
  expiresAt?: string | null;
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
