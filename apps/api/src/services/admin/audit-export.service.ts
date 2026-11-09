import { Prisma, type PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ValidationError } from "@suite/core/errors";
import { appendPlatformAuditEvent, PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  MAXIMUM_AUDIT_EXPORT_ROWS,
  MAXIMUM_PII_REASON_LENGTH,
  MINIMUM_PII_REASON_LENGTH,
  type AuditExportQuery,
} from "./audit-query.contract.js";
import { buildAuditSearchWhere } from "./audit-query.service.js";

interface ExportRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorOperatorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly organizationId: string | null;
  readonly requestId: string;
  readonly reason: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly recordHash: string;
}

const CSV_HEADER = [
  "id",
  "occurredAt",
  "actorOperatorId",
  "action",
  "entityType",
  "entityId",
  "organizationId",
  "requestId",
  "reason",
  "before",
  "after",
  "recordHash",
].join(",");

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  // A formula can be hidden behind leading whitespace; test the first
  // meaningful character and prefix the whole cell with an apostrophe.
  const guarded = FORMULA_PREFIX.test(text.trimStart()) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function toCsvRow(row: ExportRow): string {
  return [
    row.id,
    row.occurredAt.toISOString(),
    row.actorOperatorId,
    row.action,
    row.entityType,
    row.entityId,
    row.organizationId,
    row.requestId,
    row.reason,
    row.before,
    row.after,
    row.recordHash,
  ]
    .map(escapeCsvCell)
    .join(",");
}

function toFilterSummary(filters: AuditExportQuery): Record<string, string | number> {
  const summary: Record<string, string | number> = {};
  if (filters.organizationId !== undefined) {
    summary.organizationId = filters.organizationId;
  }
  if (filters.actorOperatorId !== undefined) {
    summary.actorOperatorId = filters.actorOperatorId;
  }
  if (filters.action !== undefined) {
    summary.action = filters.action;
  }
  if (filters.from !== undefined) {
    summary.from = filters.from;
  }
  if (filters.to !== undefined) {
    summary.to = filters.to;
  }
  return summary;
}

function assertPiiReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < MINIMUM_PII_REASON_LENGTH || trimmed.length > MAXIMUM_PII_REASON_LENGTH) {
    throw new ValidationError(
      "A recorded reason is required to export audit data.",
      [
        {
          name: "x-pii-reason",
          reason: `Provide a reason of ${MINIMUM_PII_REASON_LENGTH} to ${MAXIMUM_PII_REASON_LENGTH} characters.`,
        },
      ],
      { code: PLATFORM_ERROR_CODE.PII_REASON_REQUIRED },
    );
  }
  return trimmed;
}

export interface ExportAuditInput {
  readonly filters: AuditExportQuery;
  readonly operatorId: string;
  readonly reason: string;
  readonly requestId: string;
}

export interface AuditExportResult {
  readonly csv: string;
  readonly rowCount: number;
}

/**
 * Filtered CSV export. The export is capped, the PII reason is mandatory, and
 * the AUDIT_EXPORTED row is written in the same transaction as the query, so a
 * failed audit write returns no data (invariant 4, OP-6, OP-11).
 */
export async function exportAuditCsv(
  prisma: PrismaClient,
  input: ExportAuditInput,
): Promise<AuditExportResult> {
  const reason = assertPiiReason(input.reason);

  const rows = await prisma.$transaction(async (tx) => {
    const found = await tx.$queryRaw<ExportRow[]>(Prisma.sql`
      SELECT
        "id",
        "occurredAt",
        "actorOperatorId",
        "action",
        "entityType",
        "entityId",
        "organizationId",
        "requestId",
        "reason",
        "before",
        "after",
        "recordHash"
      FROM platform."audit_events"
      ${buildAuditSearchWhere(input.filters, undefined)}
      ORDER BY "occurredAt" ASC, "id" ASC
      LIMIT ${MAXIMUM_AUDIT_EXPORT_ROWS + 1}
    `);

    if (found.length > MAXIMUM_AUDIT_EXPORT_ROWS) {
      throw new ValidationError(
        `The audit export is limited to ${MAXIMUM_AUDIT_EXPORT_ROWS} rows. Narrow the filters.`,
        [
          {
            name: "filters",
            reason: "The filtered result exceeds the export cap.",
          },
        ],
        { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED },
      );
    }

    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.AUDIT_EXPORTED,
      entityType: "audit_export",
      entityId: input.requestId,
      before: null,
      after: {
        ...toFilterSummary(input.filters),
        rowCount: found.length,
      },
      reason,
      requestId: input.requestId,
    });

    return found;
  });

  const csv = [CSV_HEADER, ...rows.map(toCsvRow)].join("\r\n") + "\r\n";
  return { csv, rowCount: rows.length };
}
