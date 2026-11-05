import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import { z } from "zod";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { hasPlatformCapability } from "./capability";
import { toProblemError } from "./problem-error";
import { buildQueryString } from "./query";

/** Mirrors apps/api/src/services/admin/operator.contract.ts. */
export const OPERATORS_API_PATH = "/api/v1/admin/operators";
export const OPERATOR_PAGE_SIZE = 50;
const LOOKUP_LIMIT = 100;
const LOOKUP_PAGES = 10;

export const OPERATOR_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "REVOKED"] as const;
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number];
export type OperatorGovernanceStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

const timestamp = z.string().datetime();
export const operatorSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().max(191),
  displayName: z.string().min(1).max(100),
  status: z.enum(OPERATOR_STATUSES),
  mfaEnrolled: z.boolean(),
  lastSeenAt: timestamp.nullable(),
  capabilities: z.array(z.string().min(1).max(64)).max(64),
});
const operatorPageSchema = z.object({
  items: z.array(operatorSchema),
  nextCursor: z.string().nullable(),
});
const capabilitySetSchema = z.object({ capabilities: z.array(z.string()) });
export const operatorSessionSchema = z.object({
  id: z.string().min(1),
  issuedAt: timestamp,
  expiresAt: timestamp,
  idleExpiresAt: timestamp,
  revokedAt: timestamp.nullable(),
});
const operatorSessionPageSchema = z.object({
  items: z.array(operatorSessionSchema),
  nextCursor: z.string().nullable(),
});

export type OperatorSummary = z.infer<typeof operatorSchema>;
export type OperatorSession = z.infer<typeof operatorSessionSchema>;

interface PageQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

interface MutationInput {
  readonly operatorId: string;
  readonly idempotencyKey: string;
}

export interface UpdateOperatorStatusInput extends MutationInput {
  readonly body: {
    readonly status: OperatorGovernanceStatus;
    readonly expectedStatus: OperatorStatus;
    readonly reason: string;
  };
}

export interface ChangeOperatorCapabilitiesInput extends MutationInput {
  readonly grant: readonly string[];
  readonly revoke: readonly string[];
}

export interface RevokeOperatorSessionInput extends MutationInput {
  readonly sessionId: string;
}

/** Missing or empty capability context denies, never widens access (invariant 1). */
export function canManageOperators(capabilities: readonly string[] | undefined | null): boolean {
  return hasPlatformCapability(capabilities, PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code);
}

function operatorPath(operatorId: string): string {
  return `${OPERATORS_API_PATH}/${encodeURIComponent(operatorId)}`;
}

export async function fetchOperatorPage(
  query: PageQuery = {},
  signal?: AbortSignal,
): Promise<z.infer<typeof operatorPageSchema>> {
  const path = `${OPERATORS_API_PATH}${buildQueryString({ cursor: query.cursor, limit: query.limit ?? OPERATOR_PAGE_SIZE })}`;
  const response = await platformFetch(path, signal === undefined ? {} : { signal });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, operatorPageSchema);
}

interface FindOperatorInput {
  readonly operatorId: string;
  readonly cursor: string | undefined;
  readonly pagesLeft: number;
  readonly signal?: AbortSignal;
}

async function findOperator({
  operatorId,
  cursor,
  pagesLeft,
  signal,
}: FindOperatorInput): Promise<OperatorSummary> {
  const page = await fetchOperatorPage({ cursor, limit: LOOKUP_LIMIT }, signal);
  const found = page.items.find((item) => item.id === operatorId);
  if (found !== undefined) {
    return found;
  }
  if (page.nextCursor === null || pagesLeft <= 1) {
    throw new NotFoundError("The operator does not exist or is not visible.", {
      code: PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND,
    });
  }
  return findOperator({
    operatorId,
    cursor: page.nextCursor,
    pagesLeft: pagesLeft - 1,
    signal,
  });
}

/**
 * The operator contract exposes no single read, so this walks the cursor list
 * in pages of 100 (capped at 1,000) to open one record. Beyond the cap it
 * reports NotFound rather than inventing a record; a dedicated GET would move
 * that work to the API when the contract grows one.
 */
export async function findOperatorById(
  operatorId: string,
  signal?: AbortSignal,
): Promise<OperatorSummary> {
  return findOperator({
    operatorId,
    cursor: undefined,
    pagesLeft: LOOKUP_PAGES,
    signal,
  });
}

export async function fetchOperatorSessions(
  input: PageQuery & { readonly operatorId: string },
): Promise<z.infer<typeof operatorSessionPageSchema>> {
  const path = `${operatorPath(input.operatorId)}/sessions${buildQueryString({ cursor: input.cursor, limit: input.limit ?? OPERATOR_PAGE_SIZE })}`;
  const response = await platformFetch(path);
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, operatorSessionPageSchema);
}

export async function updateOperatorStatus(input: UpdateOperatorStatusInput): Promise<OperatorSummary> {
  const response = await platformFetch(operatorPath(input.operatorId), {
    method: "PATCH",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
    body: JSON.stringify(input.body),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, operatorSchema);
}

export async function changeOperatorCapabilities(input: ChangeOperatorCapabilitiesInput): Promise<readonly string[]> {
  const response = await platformFetch(`${operatorPath(input.operatorId)}/capabilities`, {
    method: "PATCH",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
    body: JSON.stringify({ grant: input.grant, revoke: input.revoke }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  const data = await readSuccessData(response, capabilitySetSchema);
  return data.capabilities;
}

export async function revokeOperatorSession(input: RevokeOperatorSessionInput): Promise<void> {
  const response = await platformFetch(`${operatorPath(input.operatorId)}/sessions/${encodeURIComponent(input.sessionId)}`, {
    method: "DELETE",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
}
