import { z } from "zod";
import { withTenantContext } from "@suite/db";
import { ValidationError } from "@suite/core/errors";
import { provisionSiteFromTemplate } from "@suite/website-builder/services";
import type {
  CmsList,
  CmsSiteRecord,
  CmsTemplateRecord,
  CreateSiteBody,
} from "./contract.js";
import { CMS_TEMPLATE_LIMIT } from "./contract.js";

const siteCursorSchema = z
  .object({ createdAt: z.string().datetime(), id: z.string().min(1).max(64) })
  .strict();

type SiteCursor = z.infer<typeof siteCursorSchema>;

function encodeSiteCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString(
    "base64url"
  );
}

function decodeSiteCursor(raw: string): SiteCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const result = siteCursorSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch (error: unknown) {
    throw new ValidationError("Invalid site pagination cursor.", undefined, {
      code: "VALIDATION_FAILED",
      cause: error,
    });
  }
  throw new ValidationError("Invalid site pagination cursor.", undefined, {
    code: "VALIDATION_FAILED",
  });
}

function mapSite(site: {
  id: string;
  organizationId: string;
  branchId: string | null;
  title: string;
  slug: string;
  status: string;
  timezone: string;
  primaryLocale: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { pages: number };
}): CmsSiteRecord {
  return {
    id: site.id,
    organizationId: site.organizationId,
    branchId: site.branchId,
    title: site.title,
    slug: site.slug,
    status: site.status,
    timezone: site.timezone,
    primaryLocale: site.primaryLocale,
    pagesCount: site._count.pages,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

/** Lists the authenticated workspace's sites, newest first, cursor paginated. */
export async function listSites(input: {
  readonly organizationId: string;
  readonly cursor?: string;
  readonly limit: number;
}): Promise<CmsList<CmsSiteRecord>> {
  const cursor = input.cursor === undefined ? null : decodeSiteCursor(input.cursor);
  const where =
    cursor === null
      ? { organizationId: input.organizationId }
      : {
          organizationId: input.organizationId,
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
          ],
        };

  const rows = await withTenantContext(input.organizationId, (tx) =>
    tx.cmsSite.findMany({
      where,
      include: { _count: { select: { pages: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    })
  );

  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  return {
    items: items.map(mapSite),
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? encodeSiteCursor(last.createdAt, last.id)
        : null,
  };
}

/** Reads one site inside the tenant boundary; another tenant's id is a 404. */
export async function getSite(input: {
  readonly organizationId: string;
  readonly siteId: string;
}): Promise<CmsSiteRecord | null> {
  const site = await withTenantContext(input.organizationId, (tx) =>
    tx.cmsSite.findFirst({
      where: { id: input.siteId, organizationId: input.organizationId },
      include: { _count: { select: { pages: true } } },
    })
  );
  return site === null ? null : mapSite(site);
}

/** Published TEMPLATE catalog items visible to this tenant. */
export async function listPublishedTemplates(
  organizationId: string
): Promise<CmsTemplateRecord[]> {
  const rows = await withTenantContext(organizationId, (tx) =>
    tx.cmsCatalogItem.findMany({
      where: {
        kind: "TEMPLATE",
        status: "ACTIVE",
        currentVersion: { gt: 0 },
        OR: [
          { scope: "GLOBAL", organizationId: null },
          { scope: "TENANT", organizationId },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: CMS_TEMPLATE_LIMIT.max,
    })
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    industries: row.industries,
    currentVersion: row.currentVersion,
    previewRef: row.previewRef,
  }));
}

export interface CreateSiteOutcome {
  readonly site: CmsSiteRecord;
  readonly homePage: {
    readonly id: string;
    readonly title: string;
    readonly path: string;
  };
  readonly pageCount: number;
  readonly replayed: boolean;
}

/**
 * Creates a site from a published template or blank. Tenancy, the branch and
 * the actor all come from the verified session; the browser cannot supply any
 * of them (contract cms-admin).
 */
export async function createSite(input: {
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly body: CreateSiteBody;
}): Promise<CreateSiteOutcome> {
  const provisioned = await provisionSiteFromTemplate({
    organizationId: input.organizationId,
    branchId: input.branchId,
    actorUserId: input.actorUserId,
    title: input.body.title,
    slug: input.body.slug,
    templateId: input.body.templateId ?? null,
    idempotencyKey: input.idempotencyKey,
    primaryLocale: null,
    brandName: null,
  });

  return {
    site: {
      id: provisioned.site.id,
      organizationId: provisioned.site.organizationId,
      branchId: provisioned.site.branchId,
      title: provisioned.site.title,
      slug: provisioned.site.slug,
      status: provisioned.site.status,
      timezone: provisioned.site.timezone,
      primaryLocale: provisioned.site.primaryLocale,
      pagesCount: provisioned.pages.length,
      createdAt: provisioned.site.createdAt.toISOString(),
      updatedAt: provisioned.site.updatedAt.toISOString(),
    },
    homePage: {
      id: provisioned.homePage.id,
      title: provisioned.homePage.title,
      path: provisioned.homePage.slug,
    },
    pageCount: provisioned.pages.length,
    replayed: provisioned.replayed,
  };
}
