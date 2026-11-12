import { z } from "zod";
import { Prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { InternalServerError, NotFoundError } from "@suite/core/errors";
import { resolveMediaAssets } from "@suite/media";
import {
  collectMediaAssetIds,
  validatePageAst,
  type MediaAssetMap,
  type PageAst,
} from "@suite/website-builder/ast";
import { normalizeAppearanceTokens } from "@suite/website-builder/appearance";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import {
  SITE_EXPORT_FORMAT,
  siteExportAstSchema,
  siteExportDocumentSchema,
  type SiteExportDocument,
} from "./contract.js";

/**
 * Portable site export (SC-012, T154).
 *
 * The document carries the tenant's own site: metadata, appearance, settings,
 * addresses, redirects, the full page tree and the page bodies. Internal
 * identifiers (site/page/domain ids), tenant ids, audit rows and inquiry data
 * are deliberately left out so the file is portable and reveals nothing about
 * the deployment. Media is represented by its resolved public URL map.
 *
 * The route is a read gated by cms:sites:read, so the export never mutates
 * site content; the audit row records who took a copy, inside the same
 * transaction as the read (CT-1, CT-6, FR-047).
 */

const EXPORT_SITE_INCLUDE = Prisma.validator<Prisma.CmsSiteInclude>()({
  pages: {
    include: { content: true },
    orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
  },
  appearance: true,
  settings: true,
  domains: { orderBy: [{ isPrimary: "desc" }, { hostname: "asc" }] },
  redirects: { orderBy: [{ sourcePath: "asc" }] },
});

type ExportSiteRow = Prisma.CmsSiteGetPayload<{ include: typeof EXPORT_SITE_INCLUDE }>;
type ExportPageRow = ExportSiteRow["pages"][number];
type PageBodyAst = z.infer<typeof siteExportAstSchema>;

export interface ExportSiteInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly actorUserId: string;
}

function notFound(): NotFoundError {
  return new NotFoundError("The requested site was not found.", {
    code: PLATFORM_ERROR_CODE.NOT_FOUND,
  });
}

function requirePageAst(raw: Prisma.JsonValue): PageAst {
  const validated = validatePageAst(raw);
  if (!validated.success) {
    throw new InternalServerError(
      "A page body is not valid, so this site cannot be exported."
    );
  }
  return validated.data;
}

function requireJsonObject(raw: Prisma.JsonValue): PageBodyAst {
  const parsed = siteExportAstSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InternalServerError(
      "Stored site content is not a JSON object, so this site cannot be exported."
    );
  }
  return parsed.data;
}

function draftBody(page: ExportPageRow): PageAst {
  if (page.content === null) {
    throw new InternalServerError(
      "A page has no stored content, so this site cannot be exported."
    );
  }
  return requirePageAst(page.content.draftAst);
}

function publishedBody(page: ExportPageRow): PageAst | null {
  if (page.content?.publishedAst === null || page.content?.publishedAst === undefined) {
    return null;
  }
  return requirePageAst(page.content.publishedAst);
}

function toPageBodyAst(ast: PageAst): PageBodyAst {
  return siteExportAstSchema.parse(ast);
}

function parentPathFor(
  page: ExportPageRow,
  pathByPageId: ReadonlyMap<string, string>
): string | null {
  if (page.parentId === null) {
    return null;
  }
  return pathByPageId.get(page.parentId) ?? null;
}

function exportPublishedAst(page: ExportPageRow): PageBodyAst | null {
  const published = publishedBody(page);
  return published === null ? null : toPageBodyAst(published);
}

function exportPage(
  page: ExportPageRow,
  pathByPageId: ReadonlyMap<string, string>
): SiteExportDocument["pages"][number] {
  return {
    title: page.title,
    path: page.slug,
    parentPath: parentPathFor(page, pathByPageId),
    orderIndex: page.orderIndex,
    status: page.status,
    isHomePage: page.isHomePage,
    revision: page.revision,
    draftAst: toPageBodyAst(draftBody(page)),
    publishedAst: exportPublishedAst(page),
  };
}

function collectPageAssetIds(pages: readonly ExportPageRow[]): string[] {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const ast of [draftBody(page), publishedBody(page)]) {
      if (ast === null) {
        continue;
      }
      for (const assetId of collectMediaAssetIds(ast)) {
        ids.add(assetId);
      }
    }
  }
  return [...ids];
}

function exportAppearance(row: ExportSiteRow) {
  if (row.appearance === null) {
    return null;
  }
  const appearance = row.appearance;
  return {
    brandName: row.settings?.brandName ?? row.title,
    brandLogoUrl: row.settings?.brandLogoUrl ?? null,
    draftTokens: normalizeAppearanceTokens(appearance.draftTokens),
    publishedTokens: normalizeAppearanceTokens(appearance.publishedTokens),
    sourceItemId: appearance.sourceItemId,
    sourceVersion: appearance.sourceVersion,
    version: appearance.concurrencyVersion,
    publishedAt: appearance.publishedAt.toISOString(),
  };
}

function exportSettings(row: ExportSiteRow) {
  if (row.settings === null) {
    return null;
  }
  const settings = row.settings;
  return {
    faviconUrl: settings.faviconUrl,
    brandLogoUrl: settings.brandLogoUrl,
    brandName: settings.brandName,
    headerAst: requireJsonObject(settings.headerAst),
    footerAst: requireJsonObject(settings.footerAst),
    customCss: settings.customCss,
    customHeadCode: settings.customHeadCode,
  };
}

async function resolveExportMedia(
  tx: Prisma.TransactionClient,
  input: ExportSiteInput,
  pages: readonly ExportPageRow[]
): Promise<MediaAssetMap> {
  return resolveMediaAssets(tx, input.organizationId, collectPageAssetIds(pages));
}

function buildDocument(args: {
  readonly row: ExportSiteRow;
  readonly media: MediaAssetMap;
  readonly exportedAt: Date;
}): SiteExportDocument {
  const pathByPageId = new Map(args.row.pages.map((page) => [page.id, page.slug]));
  return siteExportDocumentSchema.parse({
    format: SITE_EXPORT_FORMAT.id,
    formatVersion: SITE_EXPORT_FORMAT.version,
    exportedAt: args.exportedAt.toISOString(),
    site: {
      title: args.row.title,
      slug: args.row.slug,
      status: args.row.status,
      timezone: args.row.timezone,
      primaryLocale: args.row.primaryLocale,
      createdAt: args.row.createdAt.toISOString(),
      updatedAt: args.row.updatedAt.toISOString(),
    },
    appearance: exportAppearance(args.row),
    settings: exportSettings(args.row),
    domains: args.row.domains.map((domain) => ({
      hostname: domain.hostname,
      isPrimary: domain.isPrimary,
      isSubdomain: domain.isSubdomain,
      status: domain.status,
    })),
    redirects: args.row.redirects.map((redirect) => ({
      sourcePath: redirect.sourcePath,
      targetUrl: redirect.targetUrl,
      type: redirect.type,
    })),
    pages: args.row.pages.map((page) => exportPage(page, pathByPageId)),
    media: args.media,
  });
}

/** Reads the site inside the tenant boundary and records the export. */
export async function exportSite(input: ExportSiteInput): Promise<SiteExportDocument> {
  return withTenantContext(input.organizationId, async (tx) => {
    const row = await tx.cmsSite.findFirst({
      where: { id: input.siteId, organizationId: input.organizationId },
      include: EXPORT_SITE_INCLUDE,
    });
    if (row === null) {
      throw notFound();
    }
    const exportedAt = new Date();
    const media = await resolveExportMedia(tx, input, row.pages);
    const document = buildDocument({ row, media, exportedAt });
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: CMS_AUDIT_ACTIONS.SITE_EXPORTED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      entityId: input.siteId,
      actorUserId: input.actorUserId,
      changes: {
        format: SITE_EXPORT_FORMAT.id,
        formatVersion: SITE_EXPORT_FORMAT.version,
        pageCount: document.pages.length,
        exportedAt: document.exportedAt,
      },
    });
    return document;
  });
}
