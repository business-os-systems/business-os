import { z } from "zod";
import {
  QUOTA_RESOURCE_DEFINITIONS,
  isQuotaKey,
  type QuotaUnit,
} from "@suite/core";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

/** One decimal-string rule for limits and measured values. */
export const DECIMAL_LIMIT_PATTERN = /^\d+$/;

export const quotaItemSchema = z.object({
  resourceKey: z.string().min(1).max(64),
  limitValue: z.string().regex(DECIMAL_LIMIT_PATTERN),
  unit: z.enum(["count", "bytes"]).nullable(),
  currentValue: z.string().regex(DECIMAL_LIMIT_PATTERN).nullable(),
  isMeasurable: z.boolean(),
  asOf: z.string().datetime(),
  isEnforced: z.boolean(),
  isOverLimit: z.boolean(),
  version: z.string().min(1).max(64),
});

export const quotaListSchema = z.object({
  items: z.array(quotaItemSchema),
});

export type QuotaItem = z.infer<typeof quotaItemSchema>;

export interface QuotaUpdateItem {
  readonly resourceKey: string;
  readonly limitValue: string;
  readonly isEnforced: boolean;
  readonly expectedVersion: string | null;
}

export function quotaResourceLabel(resourceKey: string): string {
  return isQuotaKey(resourceKey)
    ? QUOTA_RESOURCE_DEFINITIONS[resourceKey].label
    : resourceKey;
}

export function quotaUnitLabel(unit: QuotaUnit | null): string {
  if (unit === "bytes") return "bytes";
  if (unit === "count") return "items";
  return "unit";
}

function quotasPath(orgId: string): string {
  return `/api/v1/admin/tenants/${encodeURIComponent(orgId)}/quotas`;
}

export async function fetchTenantQuotas(
  orgId: string,
  signal?: AbortSignal
): Promise<readonly QuotaItem[]> {
  const response = await platformFetch(
    quotasPath(orgId),
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return (await readSuccessData(response, quotaListSchema)).items;
}

export async function updateTenantQuotas(input: {
  readonly orgId: string;
  readonly items: readonly QuotaUpdateItem[];
  readonly idempotencyKey: string;
}): Promise<readonly QuotaItem[]> {
  const response = await platformFetch(quotasPath(input.orgId), {
    method: "PUT",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
    body: JSON.stringify({ items: input.items }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return (await readSuccessData(response, quotaListSchema)).items;
}
