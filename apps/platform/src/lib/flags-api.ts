import { z } from "zod";
import {
  FLAG_ENVIRONMENTS,
  FLAG_PAGE_LIMIT,
  FLAG_RULE_TYPES,
  type FlagEnvironment,
  type FlagRuleType,
} from "@suite/flags/contracts";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";
import { buildQueryString } from "./query";

/**
 * Platform flag API client. The vocabulary comes from the DB-free
 * @suite/flags/contracts entry point, so the UI never pulls @suite/db
 * (AGENTS 5.3 invariant 9).
 */

export type { FlagEnvironment, FlagRuleType };
export { FLAG_ENVIRONMENTS, FLAG_PAGE_LIMIT, FLAG_RULE_TYPES };

export const FLAG_API_PATH = "/api/v1/admin/flags";
export const FLAG_PAGE_SIZE = 25;

/**
 * Display label for an environment. The stored/API value stays lowercase
 * (development); the UI always shows Development.
 */
export function formatFlagEnvironment(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const FLAG_ENVIRONMENT_OPTIONS = FLAG_ENVIRONMENTS.map((environment) => ({
  label: formatFlagEnvironment(environment),
  value: environment,
}));

export const FLAG_RULE_TYPE_OPTIONS = [
  { label: "Tenant targeting", value: FLAG_RULE_TYPES[0] },
  { label: "Environment targeting", value: FLAG_RULE_TYPES[1] },
] as const;

const timestampSchema = z.string().datetime();

export const flagRuleSchema = z.object({
  id: z.string(),
  ruleType: z.string(),
  targetId: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
});

export const flagSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  environment: z.string(),
  isEnabled: z.boolean(),
  defaultEnabled: z.boolean(),
  version: z.number().int(),
  owner: z.string().nullable(),
  expiresAt: timestampSchema.nullable(),
  removalTicket: z.string().nullable(),
  isExpired: z.boolean(),
  lifecycleComplete: z.boolean(),
  rules: z.array(flagRuleSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const flagPageSchema = z.object({
  items: z.array(flagSchema),
  nextCursor: z.string().nullable(),
});

export type FlagRule = z.infer<typeof flagRuleSchema>;
export type FlagRecord = z.infer<typeof flagSchema>;
export type FlagPage = z.infer<typeof flagPageSchema>;

export interface FlagListQuery {
  readonly environment?: FlagEnvironment;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CreateFlagBody {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly environment: FlagEnvironment;
  readonly owner: string;
  readonly expiresAt: string;
  readonly removalTicket: string;
}

export interface FlagRuleBody {
  readonly ruleType: FlagRuleType;
  readonly targetId: string;
  readonly enabled: boolean;
  readonly priority: number;
}

export interface UpdateFlagBody {
  readonly expectedVersion: number;
  readonly isEnabled?: boolean;
  readonly defaultEnabled?: boolean;
  readonly description?: string;
  readonly owner?: string;
  readonly expiresAt?: string;
  readonly removalTicket?: string;
  readonly rules?: readonly FlagRuleBody[];
  readonly reason?: string;
}

export interface UpdateFlagInput {
  readonly key: string;
  readonly environment: FlagEnvironment;
  readonly body: UpdateFlagBody;
  readonly idempotencyKey: string;
}

export function isFlagEnvironment(value: string): value is FlagEnvironment {
  return (FLAG_ENVIRONMENTS as readonly string[]).includes(value);
}

export function isFlagRuleType(value: string): value is FlagRuleType {
  return (FLAG_RULE_TYPES as readonly string[]).includes(value);
}

function listQueryString(query: FlagListQuery): string {
  return buildQueryString({
    environment: query.environment,
    cursor: query.cursor,
    limit: query.limit ?? FLAG_PAGE_SIZE,
  });
}

export async function fetchFlagPage(
  query: FlagListQuery = {},
  signal?: AbortSignal
): Promise<FlagPage> {
  const response = await platformFetch(
    `${FLAG_API_PATH}${listQueryString(query)}`,
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, flagPageSchema);
}

export async function createFlag(
  body: CreateFlagBody,
  idempotencyKey: string
): Promise<FlagRecord> {
  const response = await platformFetch(FLAG_API_PATH, {
    method: "POST",
    headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, flagSchema);
}

export async function updateFlag(input: UpdateFlagInput): Promise<FlagRecord> {
  const response = await platformFetch(
    `${FLAG_API_PATH}/${encodeURIComponent(input.key)}?environment=${encodeURIComponent(input.environment)}`,
    {
      method: "PATCH",
      headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
      body: JSON.stringify(input.body),
    }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, flagSchema);
}
