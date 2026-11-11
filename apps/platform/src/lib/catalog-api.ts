import { z } from "zod";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

/**
 * The Platform-side HTTP contract for the Website Builder catalog (P-03). The
 * API owns the source of truth; this module validates every response at the
 * network boundary so a screen never renders an unchecked payload (P9).
 */

export const CATALOG_ITEM_KINDS = ["SECTION", "TEMPLATE", "THEME"] as const;
export const CATALOG_ITEM_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "DEPRECATED",
  "DISABLED",
  "RETIRED",
] as const;

export type CatalogItemKind = (typeof CATALOG_ITEM_KINDS)[number];
export type CatalogItemStatus = (typeof CATALOG_ITEM_STATUSES)[number];

export const CATALOG_KIND_LABELS: Readonly<Record<CatalogItemKind, string>> = {
  SECTION: "Section",
  TEMPLATE: "Template",
  THEME: "Theme",
};

export const CATALOG_STATUS_LABELS: Readonly<Record<CatalogItemStatus, string>> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  DEPRECATED: "Deprecated",
  DISABLED: "Disabled",
  RETIRED: "Retired",
};

/** Cursor pagination hard cap and stable sort: updatedAt then id (CT-5). */
export const CATALOG_PAGE_SIZE = 20;

const timestampSchema = z.string().datetime();

export const catalogTargetingSchema = z
  .object({
    plans: z.array(z.string()),
    industries: z.array(z.string()),
    orgAllowlist: z.array(z.string()),
    orgDenylist: z.array(z.string()),
  })
  .strict();

export const catalogItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(CATALOG_ITEM_KINDS),
    scope: z.enum(["GLOBAL", "TENANT"]),
    organizationId: z.string().min(1).nullable(),
    name: z.string().min(1),
    slug: z.string().min(1),
    category: z.string().min(1),
    industries: z.array(z.string()),
    definition: z.record(z.unknown()),
    previewRef: z.string().nullable(),
    flagKey: z.string().nullable(),
    targeting: catalogTargetingSchema,
    status: z.enum(CATALOG_ITEM_STATUSES),
    contractVersion: z.string().min(1),
    currentVersion: z.number().int().nonnegative(),
    draftVersion: z.number().int().positive().nullable(),
    concurrencyVersion: z.number().int().positive(),
    previewedAt: timestampSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const catalogItemPageSchema = z
  .object({
    items: z.array(catalogItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const catalogPreviewSchema = z
  .object({
    previewRef: z.string().min(1),
    expiresAt: timestampSchema,
    version: z.number().int().positive(),
    definitionHash: z.string().length(64),
  })
  .strict();

export type CatalogTargeting = z.infer<typeof catalogTargetingSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogItemPage = z.infer<typeof catalogItemPageSchema>;
export type CatalogPreview = z.infer<typeof catalogPreviewSchema>;

/** The single version a publish call may name (draft when open, else current). */
export function publishableVersion(item: CatalogItem): number | null {
  if (item.draftVersion !== null) {
    return item.draftVersion;
  }
  if (item.currentVersion > 0) {
    return item.currentVersion;
  }
  return null;
}

export interface CatalogListQuery {
  readonly appId: string;
  readonly kind: CatalogItemKind;
  readonly status?: CatalogItemStatus;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CreateCatalogItemBody {
  readonly kind: CatalogItemKind;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: readonly string[];
  readonly contractVersion: string;
  readonly flagKey: string | null;
  readonly targeting: CatalogTargeting;
  readonly definition: Record<string, unknown>;
}

export interface UpdateCatalogItemBody {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly slug?: string;
  readonly category?: string;
  readonly industries?: readonly string[];
  readonly contractVersion?: string;
  readonly flagKey?: string | null;
  readonly targeting?: CatalogTargeting;
  readonly definition?: Record<string, unknown>;
}

export interface PublishCatalogItemBody {
  readonly version: number;
  readonly changeNote?: string;
  readonly targeting?: CatalogTargeting;
}

export const CATALOG_LIFECYCLE_ACTIONS = ["deprecate", "disable", "retire"] as const;
export type CatalogLifecycleAction = (typeof CATALOG_LIFECYCLE_ACTIONS)[number];

function itemsPath(appId: string): string {
  return `/api/v1/admin/apps/${encodeURIComponent(appId)}/items`;
}

function itemPath(appId: string, itemId: string): string {
  return `${itemsPath(appId)}/${encodeURIComponent(itemId)}`;
}

function listQuery(query: CatalogListQuery): string {
  const params = new URLSearchParams({ kind: query.kind });
  if (query.status !== undefined) {
    params.set("status", query.status);
  }
  if (query.cursor !== undefined) {
    params.set("cursor", query.cursor);
  }
  params.set("limit", String(query.limit ?? CATALOG_PAGE_SIZE));
  return params.toString();
}

async function readItem(response: Response): Promise<CatalogItem> {
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, catalogItemSchema);
}

export async function fetchCatalogItemPage(
  query: CatalogListQuery,
  signal?: AbortSignal,
): Promise<CatalogItemPage> {
  const response = await platformFetch(`${itemsPath(query.appId)}?${listQuery(query)}`, {
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, catalogItemPageSchema);
}

export async function fetchCatalogItem(
  appId: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<CatalogItem> {
  const response = await platformFetch(itemPath(appId, itemId), {
    ...(signal === undefined ? {} : { signal }),
  });
  return readItem(response);
}

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { [IDEMPOTENCY_HEADER]: idempotencyKey };
}

export async function createCatalogItem(input: {
  readonly appId: string;
  readonly body: CreateCatalogItemBody;
  readonly idempotencyKey: string;
}): Promise<CatalogItem> {
  const response = await platformFetch(itemsPath(input.appId), {
    method: "POST",
    headers: mutationHeaders(input.idempotencyKey),
    body: JSON.stringify(input.body),
  });
  return readItem(response);
}

export async function updateCatalogItem(input: {
  readonly appId: string;
  readonly itemId: string;
  readonly body: UpdateCatalogItemBody;
  readonly idempotencyKey: string;
}): Promise<CatalogItem> {
  const response = await platformFetch(itemPath(input.appId, input.itemId), {
    method: "PATCH",
    headers: mutationHeaders(input.idempotencyKey),
    body: JSON.stringify(input.body),
  });
  return readItem(response);
}

export async function previewCatalogItem(input: {
  readonly appId: string;
  readonly itemId: string;
  readonly idempotencyKey: string;
}): Promise<CatalogPreview> {
  const response = await platformFetch(`${itemPath(input.appId, input.itemId)}/preview`, {
    method: "POST",
    headers: mutationHeaders(input.idempotencyKey),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, catalogPreviewSchema);
}

export async function publishCatalogItem(input: {
  readonly appId: string;
  readonly itemId: string;
  readonly body: PublishCatalogItemBody;
  readonly idempotencyKey: string;
}): Promise<CatalogItem> {
  const response = await platformFetch(`${itemPath(input.appId, input.itemId)}/publish`, {
    method: "POST",
    headers: mutationHeaders(input.idempotencyKey),
    body: JSON.stringify(input.body),
  });
  return readItem(response);
}

export async function transitionCatalogItem(input: {
  readonly appId: string;
  readonly itemId: string;
  readonly action: CatalogLifecycleAction;
  readonly idempotencyKey: string;
}): Promise<CatalogItem> {
  const response = await platformFetch(
    `${itemPath(input.appId, input.itemId)}/${input.action}`,
    { method: "POST", headers: mutationHeaders(input.idempotencyKey) },
  );
  return readItem(response);
}
