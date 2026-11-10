import { z } from "zod";
import {
  PII_REASON_HEADER,
  PLATFORM_CAPABILITIES,
  TENANT_LIFECYCLE_ACTION,
  type TenantLifecycleAction,
} from "@suite/core";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { hasPlatformCapability } from "./capability";
import { toProblemError } from "./problem-error";
import { buildQueryString } from "./query";

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
  asOf: timestampSchema,
  quotas: z.object({
    enforced: z.number().int().nonnegative(),
    overLimit: z.number().int().nonnegative(),
    measured: z.number().int().nonnegative(),
  }),
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
  isOverLimit: z.boolean(),
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
    timezone: z.string().min(1).max(64),
    createdAt: timestampSchema,
  }),
  counts: z.object({
    branches: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
    asOf: timestampSchema,
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
  readonly appId?: string;
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

function listQueryString(query: TenantListQuery): string {
  return buildQueryString({
    q: query.q === undefined || query.q === "" ? undefined : query.q,
    status: query.status,
    appId: query.appId === undefined || query.appId === "" ? undefined : query.appId,
    cursor: query.cursor,
    limit: query.limit,
  });
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
