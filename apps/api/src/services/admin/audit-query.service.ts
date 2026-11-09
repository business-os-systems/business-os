import { Prisma, type PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { InternalServerError, ValidationError } from "@suite/core/errors";
import {
  auditItemSchema,
  decodeAuditCursor,
  encodeAuditCursor,
  type AuditExportQuery,
  type AuditItem,
  type AuditPage,
  type AuditQuery,
  type AuditVerifyResult,
} from "./audit-query.contract.js";

interface AuditSearchRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly occurredAtCursor: string;
  readonly actorOperatorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly organizationId: string | null;
  readonly requestId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly recordHash: string;
}

function toAuditItem(row: AuditSearchRow): AuditItem {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorOperatorId: row.actorOperatorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    organizationId: row.organizationId,
    requestId: row.requestId,
    before: auditItemSchema.shape.before.parse(row.before),
    after: auditItemSchema.shape.after.parse(row.after),
    recordHash: row.recordHash,
  };
}

interface AuditTimeRange {
  readonly from?: Date;
  readonly to?: Date;
}

function parseAuditTimeRange(filters: AuditExportQuery): AuditTimeRange {
  const from = filters.from === undefined ? undefined : new Date(filters.from);
  const to = filters.to === undefined ? undefined : new Date(filters.to);
  if (from !== undefined && to !== undefined && from > to) {
    throw new ValidationError(
      "The audit time range is invalid.",
      [
        {
          name: "to",
          reason: "The end of the range must not precede the start.",
        },
      ],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED },
    );
  }
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

export function buildAuditSearchWhere(
  filters: AuditExportQuery,
  cursor: ReturnType<typeof decodeAuditCursor> | undefined,
): Prisma.Sql {
  const { from, to } = parseAuditTimeRange(filters);
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];

  if (filters.organizationId !== undefined) {
    conditions.push(Prisma.sql`"organizationId" = ${filters.organizationId}`);
  }
  if (filters.actorOperatorId !== undefined) {
    conditions.push(Prisma.sql`"actorOperatorId" = ${filters.actorOperatorId}`);
  }
  if (filters.action !== undefined) {
    conditions.push(Prisma.sql`"action" = ${filters.action}`);
  }
  if (from !== undefined) {
    conditions.push(Prisma.sql`"occurredAt" >= ${from}`);
  }
  if (to !== undefined) {
    conditions.push(Prisma.sql`"occurredAt" <= ${to}`);
  }
  if (cursor !== undefined) {
    conditions.push(
      Prisma.sql`(
        "occurredAt" < ${cursor.occurredAt}::timestamptz
        OR ("occurredAt" = ${cursor.occurredAt}::timestamptz AND "id" < ${cursor.id})
      )`,
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

/**
 * Cursor-paginated audit search. The cursor preserves the database timestamp
 * with microsecond precision, so rows that share a millisecond never repeat or
 * disappear between pages. The sort matches the audit table's descending index
 * (occurredAt DESC, id DESC) and is stable (CT-5).
 */
export async function searchAuditEvents(
  prisma: PrismaClient,
  query: AuditQuery,
): Promise<AuditPage> {
  const cursor = query.cursor === undefined ? undefined : decodeAuditCursor(query.cursor);
  const where = buildAuditSearchWhere(query, cursor);

  const rows = await prisma.$queryRaw<AuditSearchRow[]>(Prisma.sql`
    SELECT
      "id",
      "occurredAt",
      to_char(
        "occurredAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "occurredAtCursor",
      "actorOperatorId",
      "action",
      "entityType",
      "entityId",
      "organizationId",
      "requestId",
      "before",
      "after",
      "recordHash"
    FROM platform."audit_events"
    ${where}
    ORDER BY "occurredAt" DESC, "id" DESC
    LIMIT ${query.limit + 1}
  `);

  const items = rows.slice(0, query.limit).map(toAuditItem);
  const last = rows[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > query.limit && last !== undefined
        ? encodeAuditCursor({
            occurredAt: last.occurredAtCursor,
            id: last.id,
          })
        : null,
  };
}

export interface VerifyAuditChainInput {
  readonly actorId: string;
  readonly requestId: string;
}

/**
 * The D-019 chain is global; a per-tenant walk cannot validate links that cross
 * tenants. The optional organizationId filter on the route is reserved and is
 * deliberately not applied here.
 */
export async function verifyAuditChain(
  prisma: PrismaClient,
  input: VerifyAuditChainInput,
): Promise<AuditVerifyResult> {
  const rows = await prisma.$queryRaw<
    { verified: boolean; checkedCount: number; firstBrokenId: string | null }[]
  >(Prisma.sql`
    SELECT "verified", "checkedCount", "firstBrokenId"
    FROM platform.fn_verify_audit_chain(${input.actorId}, ${input.requestId})
  `);

  const row = rows[0];
  if (row === undefined) {
    throw new InternalServerError("The audit-chain verification returned no result.");
  }

  return {
    verified: row.verified,
    checkedCount: Number(row.checkedCount),
    firstBrokenId: row.firstBrokenId ?? null,
  };
}
