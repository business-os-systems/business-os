import { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "@suite/core/errors";
import {
  PII_REASON_HEADER,
  PLATFORM_CAPABILITIES,
  TENANT_LIFECYCLE_ACTION,
  type TenantLifecycleAction,
} from "@suite/core";
import { platformFetch, readProblemDetails, readSuccessData } from "./api";
import { hasPlatformCapability } from "./capability";

/** Mirrors @suite/redis IDEMPOTENCY_HEADER; Platform UI must not import redis. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const TENANT_API_PATHS = {
  list: "/api/v1/admin/tenants",
} as const;

/**
 * Mirrors the OrgStatus enum in packages/db/prisma/schema/core.prisma.
 * The UI layer must not import @suite/db (AGENTS 5.3 invariant 9), so the
 * vocabulary is repeated here; tests/tenant-fleet.test.tsx pins the list and
 * the contract suite proves the API agrees.
 */
export const TENANT_STATUSES = [
  "ACTIVE",
  "TRIAL",
  "PAST_DUE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export const tenantStatusSchema = z.enum(TENANT_STATUSES);

export type TenantStatus = (typeof TENANT_STATUSES)[number];

export function isTenantStatus(value: string): value is TenantStatus {
  return (TENANT_STATUSES as readonly string[]).includes(value);
}

/**
 * Personal data is a capability, not a role. An unresolved session yields
 * false, so a missing capability list never reveals the panel.
 */
export function canReadPersonalData(
  capabilities: readonly string[] | undefined | null,
): boolean {
  return hasPlatformCapability(capabilities, PLATFORM_CAPABILITIES.PII_READ.code);
}

const timestampSchema = z.string().datetime();
const identifierSchema = z.string().min(1).max(191);
const shortTextSchema = z.string().min(1).max(191);

export const tenantSummarySchema = z.object({
  id: identifierSchema,
  name: shortTextSchema,
  slug: shortTextSchema,
  status: tenantStatusSchema,
  createdAt: timestampSchema,
  branchCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  installedAppIds: z.array(z.string().min(1).max(64)).max(64),
});

export const tenantPageSchema = z.object({
  items: z.array(tenantSummarySchema),
  nextCursor: z.string().min(1).max(256).nullable(),
  total: z.number().int().nonnegative(),
});

const tenantQuotaSchema = z.object({
  resourceKey: z.string().min(1).max(64),
  limitValue: z.string().max(32),
  isEnforced: z.boolean(),
  updatedAt: timestampSchema,
});

const tenantLifecycleSchema = z.object({
  id: identifierSchema,
  fromStatus: z.string().min(1).max(32),
  toStatus: z.string().min(1).max(32),
  reason: z.string().max(255),
  actorOperatorId: identifierSchema,
  occurredAt: timestampSchema,
});

const tenantAuditSchema = z.object({
  id: identifierSchema,
  action: z.string().min(1).max(64),
  entityType: z.string().min(1).max(64),
  entityId: z.string().min(1).max(128),
  actorOperatorId: identifierSchema.nullable(),
  occurredAt: timestampSchema,
});

export const tenantRecordSchema = z.object({
  profile: z.object({
    id: identifierSchema,
    name: shortTextSchema,
    slug: shortTextSchema,
    status: tenantStatusSchema,
    createdAt: timestampSchema,
  }),
  counts: z.object({
    branches: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
  }),
  apps: z.array(z.string().min(1).max(64)).max(64),
  quotas: z.array(tenantQuotaSchema).max(64),
  lifecycle: z.array(tenantLifecycleSchema).max(64),
  lifecycleHasMore: z.boolean(),
  recentAudit: z.array(tenantAuditSchema).max(64),
});

export const tenantPiiMemberSchema = z
  .object({
    userId: identifierSchema,
    name: shortTextSchema,
    email: z.string().min(3).max(255),
    membershipStatus: z.string().min(1).max(32),
    joinedAt: timestampSchema,
  })
  .strict();

export const tenantPiiSchema = z.object({
  tenantId: identifierSchema,
  members: z.array(tenantPiiMemberSchema),
  checkedAt: timestampSchema,
});

export const tenantLifecycleResultSchema = z.object({ lifecycleEventId: identifierSchema, fromStatus: tenantStatusSchema, toStatus: tenantStatusSchema, occurredAt: timestampSchema });

export type TenantLifecycleBody =
  | { readonly reason: string; readonly expectedStatus: TenantStatus }
  | {
      readonly reason: string;
      readonly expectedStatus: TenantStatus;
      readonly confirmSlug: string;
    };

export type TenantSummary = z.infer<typeof tenantSummarySchema>;
export type TenantPage = z.infer<typeof tenantPageSchema>;
export type TenantRecord = z.infer<typeof tenantRecordSchema>;
export type TenantQuota = z.infer<typeof tenantQuotaSchema>;
export type TenantLifecycleEntry = z.infer<typeof tenantLifecycleSchema>;
export type TenantAuditEntry = z.infer<typeof tenantAuditSchema>;
export type TenantPii = z.infer<typeof tenantPiiSchema>;
export type TenantPiiMember = z.infer<typeof tenantPiiMemberSchema>;
export type TenantLifecycleResult = z.infer<
  typeof tenantLifecycleResultSchema
>;

export interface TenantListQuery {
  readonly q?: string;
  readonly status?: TenantStatus;
  readonly cursor?: string;
  readonly limit?: number;
}

export function tenantRecordPath(orgId: string): string {
  return `${TENANT_API_PATHS.list}/${encodeURIComponent(orgId)}`;
}

/**
 * The reason travels in a header, not the query string: a URL reason is kept by
 * every proxy that logs request lines, and operators name members in it.
 */
export function tenantPiiPath(orgId: string): string {
  return `${tenantRecordPath(orgId)}/pii`;
}

const TENANT_LIFECYCLE_PATH_SEGMENT: Record<TenantLifecycleAction, string> = {
  [TENANT_LIFECYCLE_ACTION.SUSPEND]: "suspend",
  [TENANT_LIFECYCLE_ACTION.RESTORE]: "restore",
  [TENANT_LIFECYCLE_ACTION.ARCHIVE]: "archive",
};

/**
 * Maps the response status onto a typed error that keeps the RFC 7807 detail,
 * so the screen shows the real reason instead of a generic failure message.
 * A 4xx detail is written for the operator; a 5xx detail may be infrastructure
 * text, so it is replaced by a message that carries the correlation id only.
 */
async function toProblemError(response: Response): Promise<Error> {
  const problem = await readProblemDetails(response);
  const detail =
    (problem.detail ?? problem.title ?? response.statusText) || "Request failed";

  if (response.status === 401) {
    return new UnauthorizedError(detail);
  }
  if (response.status === 403) {
    return new ForbiddenError(detail);
  }
  if (response.status === 404) {
    return new NotFoundError(detail);
  }
  if (response.status === 409) {
    return new ConflictError(detail, { code: problem.code ?? "CONFLICT" });
  }
  if (response.status === 422) {
    return new ValidationError(detail);
  }
  if (response.status === 429) {
    return new RateLimitError(detail);
  }

  const requestId = response.headers.get("x-request-id");
  const suffix = requestId === null ? "" : ` Reference ${requestId}.`;
  return new InternalServerError(
    `The platform API could not complete the request.${suffix}`,
  );
}

function listQueryString(query: TenantListQuery): string {
  const params = new URLSearchParams();
  if (query.q !== undefined && query.q !== "") {
    params.set("q", query.q);
  }
  if (query.status !== undefined) {
    params.set("status", query.status);
  }
  if (query.cursor !== undefined) {
    params.set("cursor", query.cursor);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const value = params.toString();
  return value === "" ? "" : `?${value}`;
}

export async function fetchTenantPage(
  query: TenantListQuery = {},
  signal?: AbortSignal,
): Promise<TenantPage> {
  const response = await platformFetch(
    `${TENANT_API_PATHS.list}${listQueryString(query)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, tenantPageSchema);
}

export async function fetchTenantRecord(
  orgId: string,
  signal?: AbortSignal,
): Promise<TenantRecord> {
  const response = await platformFetch(
    tenantRecordPath(orgId),
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, tenantRecordSchema);
}

export async function fetchTenantPii(
  orgId: string,
  reason: string,
  signal?: AbortSignal,
): Promise<TenantPii> {
  const response = await platformFetch(tenantPiiPath(orgId), {
    headers: { [PII_REASON_HEADER]: reason },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, tenantPiiSchema);
}

export async function requestTenantLifecycle(input: {
  readonly orgId: string; readonly action: TenantLifecycleAction;
  readonly body: TenantLifecycleBody; readonly idempotencyKey: string;
}): Promise<TenantLifecycleResult> {
  const response = await platformFetch(
    `${tenantRecordPath(input.orgId)}/${TENANT_LIFECYCLE_PATH_SEGMENT[input.action]}`,
    {
      method: "POST",
      headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
      body: JSON.stringify(input.body),
    },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, tenantLifecycleResultSchema);
}
