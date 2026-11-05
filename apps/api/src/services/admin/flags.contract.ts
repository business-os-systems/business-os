import type { FlagEnvironment, FlagRuleType } from "@suite/flags/contracts";

/**
 * Flag service inputs. The HTTP boundary validates these shapes; the service
 * does not import the route schema, so it can be called from a worker or test
 * without the transport layer.
 */

export interface FlagRuleInput {
  readonly ruleType: FlagRuleType;
  readonly targetId: string;
  readonly enabled: boolean;
  readonly priority: number;
}

export interface CreateFlagInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly environment: FlagEnvironment;
  readonly owner: string;
  readonly expiresAt: string;
  readonly removalTicket: string;
}

export interface UpdateFlagInput {
  readonly expectedVersion: number;
  readonly isEnabled?: boolean;
  readonly defaultEnabled?: boolean;
  readonly description?: string;
  readonly owner?: string;
  readonly expiresAt?: string;
  readonly removalTicket?: string;
  readonly rules?: readonly FlagRuleInput[];
  readonly reason?: string;
}
