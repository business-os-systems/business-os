import { Prisma, withTenantContext } from "@suite/db";
import { z } from "zod";
import {
  websiteSiteSummarySchema,
  type WebsiteSiteSummary,
  type WebsiteSitesPage,
} from "@/app/(dashboard)/websites/websites.contract";

/**
 * Tenant-scoped sites read for the Website Builder overview.
 *
 * The organization id is supplied by the authenticated session only. The query
 * runs inside withTenantContext, so PostgreSQL row-level security enforces the
 * same boundary even if a caller passed the wrong organization (DB-1, FR-057).
 */

const CURSOR_PAYLOAD_SCHEMA = z.object({
  updatedAt: z.string().datetime(),
  id: z.string().min(1).max(64),
});

const SITE_SELECT = {
  id: true,
  title: true,
  slug: true,
  status: true,
  timezone: true,
  updatedAt: true,
  domains: {
    where: { isPrimary: true },
    select: { hostname: true },
    take: 1,
  },
  pages: {
    where: { isHomePage: true },
    select: { id: true },
    take: 1,
  },
  _count: { select: { pages: true } },
} satisfies Prisma.CmsSiteSelect;

type SiteRow = Prisma.CmsSiteGetPayload<{ select: typeof SITE_SELECT }>;

type DecodedCursor =
  | { readonly kind: "none" }
  | { readonly kind: "valid"; readonly updatedAt: Date; readonly id: string }
  | { readonly kind: "invalid" };

export type WebsiteSitesReadResult =
  | { readonly kind: "ok"; readonly page: WebsiteSitesPage }
  | { readonly kind: "invalid_cursor" };

function decodeCursor(rawCursor: string | undefined): DecodedCursor {
  if (rawCursor === undefined) {
    return { kind: "none" };
  }
  try {
    const decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsed = CURSOR_PAYLOAD_SCHEMA.safeParse(JSON.parse(decoded));
    if (!parsed.success) {
      return { kind: "invalid" };
    }
    return {
      kind: "valid",
      updatedAt: new Date(parsed.data.updatedAt),
      id: parsed.data.id,
    };
  } catch {
    // A malformed cursor is caller input, not an internal failure: the route
    // answers with a validation problem and never reaches the database.
    return { kind: "invalid" };
  }
}

function encodeCursor(site: Pick<WebsiteSiteSummary, "id" | "updatedAt">): string {
  const payload = JSON.stringify({ updatedAt: site.updatedAt, id: site.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function toSiteSummary(row: SiteRow): WebsiteSiteSummary {
  return websiteSiteSummarySchema.parse({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    timezone: row.timezone,
    primaryDomain: row.domains[0]?.hostname ?? null,
    pageCount: row._count.pages,
    homePageId: row.pages[0]?.id ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function cursorFilter(cursor: DecodedCursor): Prisma.CmsSiteWhereInput {
  if (cursor.kind !== "valid") {
    return {};
  }
  return {
    OR: [
      { updatedAt: { lt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Lists one stable page of the caller's sites. Sort is (updatedAt DESC, id
 * DESC); the cursor carries both values so a page boundary that shares a
 * timestamp never skips or repeats a row (CT-5).
 */
export async function listWebsiteSites(input: {
  readonly organizationId: string;
  readonly cursor?: string;
  readonly limit: number;
}): Promise<WebsiteSitesReadResult> {
  const cursor = decodeCursor(input.cursor);
  if (cursor.kind === "invalid") {
    return { kind: "invalid_cursor" };
  }

  const rows = await withTenantContext(input.organizationId, (tx) =>
    tx.cmsSite.findMany({
      where: { organizationId: input.organizationId, ...cursorFilter(cursor) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      select: SITE_SELECT,
    })
  );

  const pageRows = rows.slice(0, input.limit);
  const lastRow = pageRows.at(-1);
  const nextCursor =
    rows.length > input.limit && lastRow !== undefined
      ? encodeCursor(toSiteSummary(lastRow))
      : null;

  return {
    kind: "ok",
    page: { sites: pageRows.map(toSiteSummary), nextCursor },
  };
}
