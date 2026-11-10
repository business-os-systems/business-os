import { Prisma, type PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";

export interface TenantOverviewRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly branchCount: number;
  readonly memberCount: number;
  readonly installedAppIds: string[];
  readonly timezone: string;
  readonly asOf: Date;
}

export interface TenantQuotaSummary {
  readonly enforced: number;
  readonly overLimit: number;
  readonly measured: number;
}

export interface TenantFilter {
  readonly search?: string;
  readonly status?: string;
  readonly appId?: string;
}

export interface TenantListFilters extends TenantFilter {
  readonly after?: { readonly name: string; readonly id: string };
  readonly limit: number;
}

const OVERVIEW_COLUMNS = Prisma.sql`
  "id", "name", "slug", "status", "createdAt",
  "branchCount", "memberCount", "installedAppIds", "timezone",
  now() AS "asOf"
`;

/**
 * Filters run against the curated view only: app_platform has no grant on the
 * public tables behind it, and the view exposes tenant metadata without PII.
 */
function filterClause(filter: TenantFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filter.search !== undefined) {
    const escaped = filter.search.replace(/[\\%_]/g, (char) => `\\${char}`);
    const pattern = `%${escaped}%`;
    conditions.push(
      Prisma.sql`("name" ILIKE ${pattern} OR "slug" ILIKE ${pattern})`
    );
  }
  if (filter.status !== undefined) {
    conditions.push(Prisma.sql`"status"::text = ${filter.status}`);
  }
  if (filter.appId !== undefined) {
    conditions.push(Prisma.sql`${filter.appId} = ANY("installedAppIds")`);
  }

  return conditions.length === 0
    ? Prisma.sql`TRUE`
    : Prisma.join(conditions, " AND ");
}

function pageClause(after: TenantListFilters["after"]): Prisma.Sql {
  if (after === undefined) {
    return Prisma.sql`TRUE`;
  }
  return Prisma.sql`("name" > ${after.name} OR ("name" = ${after.name} AND "id" > ${after.id}))`;
}

export async function listTenantOverview(
  prisma: PrismaClient,
  filters: TenantListFilters
): Promise<TenantOverviewRow[]> {
  return prisma.$queryRaw<TenantOverviewRow[]>(Prisma.sql`
    SELECT ${OVERVIEW_COLUMNS}
    FROM "platform"."v_tenant_overview"
    WHERE ${filterClause(filters)} AND ${pageClause(filters.after)}
    ORDER BY "name" ASC, "id" ASC
    LIMIT ${filters.limit}
  `);
}

/**
 * One batched quota read for the whole page. The view computes consumption for
 * the measurable resources; the summary keeps the fleet table honest without
 * an N+1 query per tenant.
 */
export async function readQuotaSummaries(
  prisma: PrismaClient,
  organizationIds: readonly string[],
): Promise<Map<string, TenantQuotaSummary>> {
  if (organizationIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    {
      organizationId: string;
      enforced: bigint | number;
      overLimit: bigint | number;
      measured: bigint | number;
    }[]
  >(Prisma.sql`
    SELECT
      "organizationId",
      count(*) FILTER (WHERE "isEnforced")::bigint AS "enforced",
      count(*) FILTER (
        WHERE "isEnforced"
          AND "currentValue" IS NOT NULL
          AND "currentValue"::numeric > "limitValue"::numeric
      )::bigint AS "overLimit",
      count(*) FILTER (WHERE "currentValue" IS NOT NULL)::bigint AS "measured"
    FROM "platform"."v_tenant_usage"
    WHERE "organizationId" IN (${Prisma.join(organizationIds)})
    GROUP BY "organizationId"
  `);
  return new Map(
    rows.map((row) => [
      row.organizationId,
      {
        enforced: Number(row.enforced),
        overLimit: Number(row.overLimit),
        measured: Number(row.measured),
      },
    ]),
  );
}

export async function countTenantOverview(
  prisma: PrismaClient,
  filter: TenantFilter
): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint | number }[]>(
    Prisma.sql`
      SELECT count(*)::bigint AS total
      FROM "platform"."v_tenant_overview"
      WHERE ${filterClause(filter)}
    `
  );
  return Number(rows[0]?.total ?? 0);
}

export async function readTenantOverview(
  prisma: Prisma.TransactionClient,
  organizationId: string
): Promise<TenantOverviewRow | null> {
  const rows = await prisma.$queryRaw<TenantOverviewRow[]>(Prisma.sql`
    SELECT ${OVERVIEW_COLUMNS}
    FROM "platform"."v_tenant_overview"
    WHERE "id" = ${organizationId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

/**
 * Every entitlement and settings read or write names a real tenant before it
 * touches anything else. The guard lives beside the view so the 404 contract
 * cannot drift between services.
 */
export async function assertTenantExists(
  prisma: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  const overview = await readTenantOverview(prisma, organizationId);
  if (overview === null) {
    throw new NotFoundError("Tenant not found.", {
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    });
  }
}
