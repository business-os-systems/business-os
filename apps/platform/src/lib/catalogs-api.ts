import { z } from "zod";
import { CATALOG_KEYS, MAX_CATALOG_SORT_ORDER } from "@suite/core";
import { platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

const CATALOG_CODE_MAX_LENGTH = 64;
const CATALOG_LABEL_MAX_LENGTH = 191;
const CATALOG_NAME_MAX_LENGTH = 100;

const metadataSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

/** The Platform editor's contract, validated at the network boundary (P9). */
export const catalogValueSchema = z
  .object({
    catalogKey: z.enum(CATALOG_KEYS),
    code: z.string().min(1).max(CATALOG_CODE_MAX_LENGTH),
    label: z.string().min(1).max(CATALOG_LABEL_MAX_LENGTH),
    sortOrder: z.number().int().min(0).max(MAX_CATALOG_SORT_ORDER),
    isActive: z.boolean(),
    metadata: metadataSchema,
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const catalogSchema = z
  .object({
    key: z.enum(CATALOG_KEYS),
    label: z.string().min(1).max(CATALOG_NAME_MAX_LENGTH),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    values: z.array(catalogValueSchema),
  })
  .strict();

export const catalogListSchema = z
  .object({ catalogs: z.array(catalogSchema) })
  .strict();

export type CatalogValue = z.infer<typeof catalogValueSchema>;
export type Catalog = z.infer<typeof catalogSchema>;

const CATALOGS_PATH = "/api/v1/admin/catalogs";

export async function fetchCatalogs(
  signal?: AbortSignal,
): Promise<readonly Catalog[]> {
  const response = await platformFetch(
    CATALOGS_PATH,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return (await readSuccessData(response, catalogListSchema)).catalogs;
}

export interface CreateCatalogValueBody {
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
}

export interface UpdateCatalogValueBody {
  readonly label: string;
  readonly sortOrder: number;
  readonly expectedVersion: number;
}

export interface CatalogValueStatusBody {
  readonly isActive: boolean;
  readonly expectedVersion: number;
}

function valuePath(catalogKey: string, code: string): string {
  return `${CATALOGS_PATH}/${encodeURIComponent(catalogKey)}/values/${encodeURIComponent(code)}`;
}

export async function createCatalogValue(input: {
  readonly catalogKey: string;
  readonly body: CreateCatalogValueBody;
}): Promise<CatalogValue> {
  const response = await platformFetch(
    `${CATALOGS_PATH}/${encodeURIComponent(input.catalogKey)}/values`,
    { method: "POST", body: JSON.stringify(input.body) },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, catalogValueSchema);
}

export async function updateCatalogValue(input: {
  readonly catalogKey: string;
  readonly code: string;
  readonly body: UpdateCatalogValueBody | CatalogValueStatusBody;
}): Promise<CatalogValue> {
  const response = await platformFetch(valuePath(input.catalogKey, input.code), {
    method: "PATCH",
    body: JSON.stringify(input.body),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, catalogValueSchema);
}
