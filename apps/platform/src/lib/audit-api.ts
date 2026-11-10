import { z } from "zod";
import { PII_REASON_HEADER } from "@suite/core";
import { InternalServerError } from "@suite/core/errors";
import { platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";
import { buildQueryString } from "./query";

/**
 * Platform audit API client. The chain, its verification and the CSV shape stay
 * server-side; this module owns the typed boundary and the CSV download.
 */

const AUDIT_API_PATH = "/api/v1/admin/audit";
export const AUDIT_PAGE_SIZE = 50;
export const MINIMUM_AUDIT_REASON_LENGTH = 5;
export const MAXIMUM_AUDIT_REASON_LENGTH = 255;
export const AUDIT_IDENTIFIER_MAX_LENGTH = 191;
export const AUDIT_ACTION_MAX_LENGTH = 64;

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(AUDIT_IDENTIFIER_MAX_LENGTH);
const timestampSchema = z.string().datetime();

const auditPayloadSchema = z.record(z.unknown()).nullable();

const auditRecordSchema = z
  .object({
    id: z.string().min(1),
    occurredAt: timestampSchema,
    actorOperatorId: z.string().nullable(),
    action: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    organizationId: z.string().nullable(),
    requestId: z.string().min(1),
    before: auditPayloadSchema,
    after: auditPayloadSchema,
    recordHash: z.string().min(1),
  })
  .strict();

const auditPageSchema = z
  .object({
    items: z.array(auditRecordSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

const auditVerifyTenantResultSchema = z
  .object({
    organizationId: z.string().min(1),
    verified: z.boolean(),
    checkedCount: z.number().int().nonnegative(),
    firstBrokenId: z.string().nullable(),
  })
  .strict();

const auditVerifyResultSchema = z
  .object({
    verified: z.boolean(),
    checkedCount: z.number().int().nonnegative(),
    firstBrokenId: z.string().nullable(),
    /** Present only when the request named a tenant. */
    tenant: auditVerifyTenantResultSchema.optional(),
  })
  .strict();

const auditFiltersSchema = z.object({
  organizationId: identifierSchema.optional(),
  actorOperatorId: identifierSchema.optional(),
  action: z.string().trim().min(1).max(AUDIT_ACTION_MAX_LENGTH).optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
});

const REASON_WHITESPACE = /\s+/g;
// The reason travels in the X-PII-Reason header, so it must survive the
// browser's ByteString header encoding and carry no line breaks.
const HEADER_SAFE_REASON = /^[\u0020-\u007E\u00A0-\u00FF]*$/;

export const auditReasonSchema = z
  .string()
  .transform((value) => value.replace(REASON_WHITESPACE, " ").trim())
  .pipe(
    z
      .string()
      .min(MINIMUM_AUDIT_REASON_LENGTH, {
        message: `Provide a reason of at least ${MINIMUM_AUDIT_REASON_LENGTH} characters.`,
      })
      .max(MAXIMUM_AUDIT_REASON_LENGTH, {
        message: `Keep the reason to ${MAXIMUM_AUDIT_REASON_LENGTH} characters or fewer.`,
      })
      .regex(HEADER_SAFE_REASON, {
        message: "Use Latin letters, numbers and punctuation only.",
      }),
  );

export type AuditPayload = z.infer<typeof auditPayloadSchema>;
export type AuditRecord = z.infer<typeof auditRecordSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type AuditVerifyResult = z.infer<typeof auditVerifyResultSchema>;
export type AuditVerifyTenantResult = z.infer<
  typeof auditVerifyTenantResultSchema
>;
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export interface AuditListQuery extends AuditFilters {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AuditExportInput {
  readonly filters: AuditFilters;
  readonly reason: string;
}

function auditFilterParams(
  filters: AuditFilters,
): Readonly<Record<string, string | undefined>> {
  return {
    organizationId: filters.organizationId,
    actorOperatorId: filters.actorOperatorId,
    action: filters.action,
    from: filters.from,
    to: filters.to,
  };
}

function filterQueryString(filters: AuditFilters): string {
  return buildQueryString(auditFilterParams(filters));
}

export async function fetchAuditPage(
  query: AuditListQuery,
): Promise<AuditPage> {
  const filters = auditFiltersSchema.parse(query);
  const search = buildQueryString({
    ...auditFilterParams(filters),
    cursor: query.cursor,
    limit: query.limit ?? AUDIT_PAGE_SIZE,
  });
  const response = await platformFetch(`${AUDIT_API_PATH}${search}`);
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, auditPageSchema);
}

/**
 * The global chain is verified on every call. Naming a tenant adds the
 * tenant-attributed report; the API never replaces the global result with it.
 */
export async function verifyAuditChain(
  organizationId?: string,
): Promise<AuditVerifyResult> {
  const search = buildQueryString({ organizationId });
  const response = await platformFetch(`${AUDIT_API_PATH}/verify${search}`);
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, auditVerifyResultSchema);
}

const CSV_CONTENT_TYPE = "text/csv";

function csvFilename(now: Date): string {
  return `audit-export-${now.toISOString().replace(/[:.]/g, "-")}.csv`;
}

function saveCsvFile(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari needs the object URL until the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Exports the filtered rows. The reason is required by the API; a refusal keeps
 * the RFC 7807 body so the screen can show the real cause instead of a generic
 * network failure.
 */
export async function downloadAuditCsv(input: AuditExportInput): Promise<void> {
  const filters = auditFiltersSchema.parse(input.filters);
  const reason = auditReasonSchema.parse(input.reason);
  const response = await platformFetch(
    `${AUDIT_API_PATH}/export${filterQueryString(filters)}`,
    { headers: { [PII_REASON_HEADER]: reason } },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes(CSV_CONTENT_TYPE)) {
    throw new InternalServerError(
      "The audit export did not return a CSV file.",
    );
  }
  saveCsvFile(await response.text(), csvFilename(new Date()));
}
