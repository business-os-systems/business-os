import type { OrgStatus, PrismaClient } from "@suite/db";
import { ValidationError } from "@suite/core/errors";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import {
  countTenantOverview,
  listTenantOverview,
  readQuotaSummaries,
  type TenantOverviewRow,
  type TenantQuotaSummary,
} from "./tenant-view.service.js";

export interface TenantListQuery {
  readonly q?: string;
  readonly status?: string;
  readonly appId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: OrgStatus;
  readonly createdAt: string;
  readonly branchCount: number;
  readonly memberCount: number;
  readonly installedAppIds: string[];
  readonly asOf: string;
  readonly quotas: TenantQuotaSummary;
}

export interface TenantPage {
  readonly items: TenantSummary[];
  readonly nextCursor: string | null;
  readonly total: number;
}

interface CursorPosition {
  readonly name: string;
  readonly id: string;
}

export function encodeTenantCursor(row: TenantOverviewRow): string {
  return Buffer.from(
    JSON.stringify({ name: row.name, id: row.id }),
    "utf8"
  ).toString("base64url");
}

export function decodeTenantCursor(raw: string): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid pagination cursor.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }

  const candidate = parsed as { name?: unknown; id?: unknown };
  if (
    typeof candidate.name !== "string" ||
    candidate.name.length === 0 ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0
  ) {
    throw new ValidationError("Invalid pagination cursor.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }

  return { name: candidate.name, id: candidate.id };
}

function toSummary(
  row: TenantOverviewRow,
  quotas: TenantQuotaSummary,
): TenantSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as OrgStatus,
    createdAt: row.createdAt.toISOString(),
    branchCount: row.branchCount,
    memberCount: row.memberCount,
    installedAppIds: row.installedAppIds,
    asOf: row.asOf.toISOString(),
    quotas,
  };
}

export async function listTenants(
  prisma: PrismaClient,
  query: TenantListQuery
): Promise<TenantPage> {
  const after =
    query.cursor === undefined ? undefined : decodeTenantCursor(query.cursor);
  const filter = { search: query.q, status: query.status, appId: query.appId };

  const rows = await listTenantOverview(prisma, {
    ...filter,
    after,
    limit: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const [quotaSummaries, total] = await Promise.all([
    readQuotaSummaries(
      prisma,
      page.map((row) => row.id),
    ),
    countTenantOverview(prisma, filter),
  ]);

  return {
    items: page.map((row) =>
      toSummary(
        row,
        quotaSummaries.get(row.id) ?? {
          enforced: 0,
          overLimit: 0,
          measured: 0,
        },
      ),
    ),
    nextCursor:
      rows.length > query.limit && last !== undefined
        ? encodeTenantCursor(last)
        : null,
    total,
  };
}
