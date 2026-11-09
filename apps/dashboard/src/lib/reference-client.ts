import { cookies } from "next/headers";
import { z } from "zod";
import type { CatalogKey } from "@suite/core";
import type { FormFieldOption } from "@suite/ui";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { getPublicApiUrl } from "@/lib/env";

/**
 * Server-side client for the reference read contract (FR-105, FR-112, FR-113).
 *
 * The dashboard never enumerates a reference vocabulary in code: the values are
 * read from the database through the API. The fetch is server-to-server and
 * forwards only the tenant session cookie, so the browser never receives the
 * API base URL or the raw catalog payload shape.
 */

/**
 * Cache contract (CT-11).
 *
 * key:          the catalog request URL, /api/v1/reference/catalogs/<key>
 * ttl:          60 seconds, the maximum staleness the API's Cache-Control
 *               permits; the dashboard fetch uses no-store, so a read is always
 *               fresh and can never exceed that upper bound
 * invalidation: a Platform catalog mutation (POST /catalogs/:key/values or
 *               PATCH /catalogs/:key/values/:code, #232) changes the response
 *               body and therefore its ETag; otherwise the TTL expires it
 *
 * The dashboard deliberately adds no second cache: the fetch carries a session
 * cookie, and Next's data cache keys on the URL only, so caching here could
 * serve one caller's 401 to everyone for the whole TTL.
 */
export const REFERENCE_CATALOG_CACHE = {
  keyPrefix: "reference:catalog",
  ttlSeconds: 60,
  invalidatedBy: "Platform catalog mutation (POST/PATCH /api/v1/admin/catalogs) or TTL expiry",
} as const;

export const REFERENCE_API_PATH = "/api/v1/reference/catalogs";

const referenceValueSchema = z
  .object({
    code: z.string().min(1).max(64),
    label: z.string().min(1).max(191),
    sortOrder: z.number().int().nonnegative(),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

const referenceCatalogSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(100),
    description: z.string().nullable(),
    values: z.array(referenceValueSchema),
  })
  .strict();

const referenceCatalogEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        catalog: referenceCatalogSchema,
        asOf: z.string().datetime(),
      })
      .strict(),
    requestId: z.string().min(1),
    timestamp: z.string().min(1),
  })
  .strict();

const problemDetailsSchema = z
  .object({
    title: z.string().optional(),
    detail: z.string().optional(),
    code: z.string().optional(),
  })
  .passthrough();

interface ProblemSummary {
  readonly detail: string;
  readonly code: string | null;
}

export type ReferenceValue = z.infer<typeof referenceValueSchema>;

/** A read failure carries the RFC 7807 detail so the UI can show the real reason. */
export class ReferenceCatalogError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "ReferenceCatalogError";
  }
}

async function readProblemSummary(response: Response): Promise<ProblemSummary> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = problemDetailsSchema.safeParse(body);
  if (!parsed.success) {
    return { detail: response.statusText, code: null };
  }
  return {
    detail: parsed.data.detail ?? parsed.data.title ?? response.statusText,
    code: parsed.data.code ?? null,
  };
}

async function readSessionCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new ReferenceCatalogError(
      "A tenant session is required to read reference data.",
      401,
      "AUTH_REQUIRED",
    );
  }
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

/**
 * Reads one catalog's active values. Retired values never reach the UI because
 * the API filters them (FR-104); a failed read throws instead of returning an
 * empty list, so the form cannot silently render with no options.
 */
export async function readReferenceCatalogValues(
  catalogKey: CatalogKey,
): Promise<readonly ReferenceValue[]> {
  const cookieHeader = await readSessionCookieHeader();
  const url = `${getPublicApiUrl()}${REFERENCE_API_PATH}/${encodeURIComponent(catalogKey)}`;
  const response = await fetch(url, {
    headers: { Cookie: cookieHeader, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const problem = await readProblemSummary(response);
    throw new ReferenceCatalogError(problem.detail, response.status, problem.code);
  }
  const envelope = referenceCatalogEnvelopeSchema.parse(await response.json());
  return envelope.data.catalog.values;
}

/** Maps catalog values to the option shape the shared form engine consumes. */
export function toFormFieldOptions(values: readonly ReferenceValue[]): FormFieldOption[] {
  return values.map((value) => ({ label: value.label, value: value.code }));
}

export async function readBranchTypeOptions(): Promise<FormFieldOption[]> {
  return toFormFieldOptions(await readReferenceCatalogValues("branch_type"));
}
