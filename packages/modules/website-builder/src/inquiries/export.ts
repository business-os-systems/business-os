import { extractContactFields, type InquiryStatus } from "./policy.js";
import {
  readInquiriesForExport,
  type InquiryRecord,
} from "./store.js";

/**
 * Tenant inquiry export (FR-047, FR-048, FR-049). The CSV carries the gated
 * contact fields, so the caller must already hold cms:leads:pii; this layer
 * never checks capabilities itself and never reads another tenant's rows.
 */

const CSV_COLUMNS = [
  "id",
  "submittedAt",
  "siteId",
  "pageId",
  "blockId",
  "status",
  "name",
  "email",
  "phone",
  "payload",
] as const;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * A spreadsheet evaluates a cell that starts with a formula marker even when it
 * sits in a quoted CSV field, so the leading apostrophe neutralises it
 * (CWE-1236). Whitespace is trimmed before the test because some spreadsheets
 * ignore a leading space too.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const guarded = FORMULA_PREFIX.test(text.trimStart()) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

interface InquiryExportRow {
  readonly id: string;
  readonly submittedAt: string;
  readonly siteId: string;
  readonly pageId: string | null;
  readonly blockId: string;
  readonly status: InquiryStatus;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly payload: string;
}

function toExportRow(record: InquiryRecord): InquiryExportRow {
  const contact = extractContactFields(record.payload);
  return {
    id: record.id,
    submittedAt: record.createdAt.toISOString(),
    siteId: record.siteId,
    pageId: record.pageId,
    blockId: record.blockId,
    status: record.status,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    payload: JSON.stringify(record.payload),
  };
}

function toCsvLine(row: InquiryExportRow): string {
  return [
    row.id,
    row.submittedAt,
    row.siteId,
    row.pageId,
    row.blockId,
    row.status,
    row.name,
    row.email,
    row.phone,
    row.payload,
  ]
    .map(escapeCsvCell)
    .join(",");
}

/** Builds the downloadable CSV body; exposed so the format is unit-testable. */
export function buildInquiryCsv(records: readonly InquiryRecord[]): string {
  return [CSV_COLUMNS.join(","), ...records.map((record) => toCsvLine(toExportRow(record)))].join(
    "\r\n"
  ) + "\r\n";
}

export function buildInquiryExportFilename(now: Date): string {
  return `inquiries-${now.toISOString().replace(/[:.]/g, "-")}.csv`;
}

export interface InquiryExportInput {
  readonly organizationId: string;
  readonly siteId?: string;
  readonly status?: InquiryStatus;
  readonly actorUserId: string;
}

export interface InquiryExportResult {
  readonly csv: string;
  readonly rowCount: number;
  readonly filename: string;
}

export async function exportTenantInquiries(
  input: InquiryExportInput
): Promise<InquiryExportResult> {
  const { rows } = await readInquiriesForExport(input);
  return {
    csv: buildInquiryCsv(rows),
    rowCount: rows.length,
    filename: buildInquiryExportFilename(new Date()),
  };
}
