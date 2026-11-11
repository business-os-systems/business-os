import { z } from "zod";
import { STEP_UP_TOKEN_HEADER } from "@suite/core";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

export const SITE_TAKEDOWN_ACTIONS = {
  SUSPEND: "SUSPEND",
  RESTORE: "RESTORE",
} as const;

export type SiteTakedownAction =
  (typeof SITE_TAKEDOWN_ACTIONS)[keyof typeof SITE_TAKEDOWN_ACTIONS];

export const CMS_SITE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "MAINTENANCE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export const cmsSiteStatusSchema = z.enum(CMS_SITE_STATUSES);
export type CmsSiteStatus = z.infer<typeof cmsSiteStatusSchema>;

export const tenantSiteSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    slug: z.string().min(1),
    status: cmsSiteStatusSchema,
    hostnames: z.array(z.string()),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const tenantSiteListSchema = z
  .object({ items: z.array(tenantSiteSchema) })
  .strict();

export const siteTakedownResultSchema = z
  .object({
    siteId: z.string().min(1),
    fromStatus: cmsSiteStatusSchema,
    toStatus: cmsSiteStatusSchema,
    occurredAt: z.string().datetime(),
    hostnames: z.array(z.string()),
  })
  .strict();

export type TenantSite = z.infer<typeof tenantSiteSchema>;
export type SiteTakedownResult = z.infer<typeof siteTakedownResultSchema>;
export interface SiteTakedownBody {
  readonly reason: string;
  readonly expectedStatus: CmsSiteStatus;
}

function tenantSitesPath(orgId: string): string {
  return "/api/v1/admin/tenants/" + encodeURIComponent(orgId) + "/sites";
}

const ACTION_PATH: Record<SiteTakedownAction, string> = {
  SUSPEND: "suspend",
  RESTORE: "restore",
};

export async function fetchTenantSites(
  orgId: string,
  signal?: AbortSignal
): Promise<TenantSite[]> {
  const response = await platformFetch(tenantSitesPath(orgId), {
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  const page = await readSuccessData(response, tenantSiteListSchema);
  return page.items;
}

export async function requestSiteTakedown(input: {
  readonly orgId: string;
  readonly siteId: string;
  readonly action: SiteTakedownAction;
  readonly body: SiteTakedownBody;
  readonly idempotencyKey: string;
  readonly stepUpToken: string;
}): Promise<SiteTakedownResult> {
  const response = await platformFetch(
    tenantSitesPath(input.orgId) +
      "/" +
      encodeURIComponent(input.siteId) +
      "/" +
      ACTION_PATH[input.action],
    {
      method: "POST",
      headers: {
        [IDEMPOTENCY_HEADER]: input.idempotencyKey,
        [STEP_UP_TOKEN_HEADER]: input.stepUpToken,
      },
      body: JSON.stringify(input.body),
    }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, siteTakedownResultSchema);
}
