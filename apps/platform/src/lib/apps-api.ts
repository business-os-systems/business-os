import { z } from "zod";
import {
  APP_CATALOG_AVAILABILITIES,
  MAX_CATALOG_SORT_ORDER,
  getAppManifest,
  type AppCatalogAvailability,
} from "@suite/core";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

export {
  APP_CATALOG_AVAILABILITIES,
  MAX_CATALOG_SORT_ORDER,
  type AppCatalogAvailability,
};

export const APP_CATALOG_AVAILABILITY_LABELS: Readonly<
  Record<AppCatalogAvailability, string>
> = {
  HIDDEN: "Hidden",
  PREVIEW: "Preview",
  AVAILABLE: "Available",
  RETIRED: "Retired",
};

const availabilitySchema = z.enum(APP_CATALOG_AVAILABILITIES);

export const catalogAppSchema = z.object({
  appId: z.string().min(1).max(64),
  name: z.string().min(1).max(191),
  title: z.string().min(1).max(191),
  description: z.string().min(1).max(1000),
  category: z.string().min(1).max(64).nullable(),
  availability: availabilitySchema,
  sortOrder: z.number().int().nonnegative().max(MAX_CATALOG_SORT_ORDER),
  installedCount: z.number().int().nonnegative(),
  version: z.string().min(1).max(64).nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export const catalogListSchema = z.object({
  apps: z.array(catalogAppSchema),
});

export const entitlementAppSchema = z.object({
  appId: z.string().min(1).max(64),
  isEnabled: z.boolean(),
  installedAt: z.string().datetime(),
  version: z.string().min(1).max(64),
  branchOverrides: z.array(
    z.object({ branchId: z.string(), isEnabled: z.boolean() })
  ),
});

export const entitlementListSchema = z.object({
  apps: z.array(entitlementAppSchema),
});

export type CatalogApp = z.infer<typeof catalogAppSchema>;
export type TenantEntitlement = z.infer<typeof entitlementAppSchema>;

export interface CatalogOverrideBody {
  readonly availability: AppCatalogAvailability;
  readonly sortOrder: number;
  readonly category: string | null;
  readonly expectedVersion: string | null;
}

export function appDisplayTitle(appId: string): string {
  return getAppManifest(appId)?.title ?? appId;
}

export function installedAppPath(orgId: string): string {
  return `/api/v1/admin/tenants/${encodeURIComponent(orgId)}/entitlements`;
}

export async function fetchAppCatalog(
  signal?: AbortSignal
): Promise<readonly CatalogApp[]> {
  const response = await platformFetch(
    "/api/v1/admin/catalog",
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return (await readSuccessData(response, catalogListSchema)).apps;
}

export async function updateAppCatalogOverride(input: {
  readonly appId: string;
  readonly body: CatalogOverrideBody;
  readonly idempotencyKey: string;
}): Promise<CatalogApp> {
  const response = await platformFetch(
    `/api/v1/admin/catalog/${encodeURIComponent(input.appId)}`,
    {
      method: "PATCH",
      headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
      body: JSON.stringify(input.body),
    }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, catalogAppSchema);
}

export async function fetchTenantEntitlements(
  orgId: string,
  signal?: AbortSignal
): Promise<readonly TenantEntitlement[]> {
  const response = await platformFetch(
    installedAppPath(orgId),
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return (await readSuccessData(response, entitlementListSchema)).apps;
}

export async function setTenantEntitlement(input: {
  readonly orgId: string;
  readonly appId: string;
  readonly enabled: boolean;
  readonly expectedVersion: string;
  readonly idempotencyKey: string;
}): Promise<readonly TenantEntitlement[]> {
  const response = await platformFetch(installedAppPath(input.orgId), {
    method: "PUT",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
    body: JSON.stringify({
      appId: input.appId,
      enabled: input.enabled,
      expectedVersion: input.expectedVersion,
    }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return (await readSuccessData(response, entitlementListSchema)).apps;
}

