import { Prisma, withTenantContext } from "@suite/db";
import { ConflictError, NotFoundError } from "@suite/core/errors";
import { logger } from "@suite/logger";
import { resolveMediaAssets, type MediaAssetResolutionMap } from "@suite/media";
import { PageAstSchema } from "@suite/website-builder/ast";
import {
  collectMediaAssetIds,
  type PageAst,
} from "@suite/website-builder/ast";
import { writeCmsAudit } from "@suite/website-builder/services";
import {
  CMS_AUDIT_ACTIONS,
  CMS_AUDIT_ENTITY_TYPES,
  CMS_CONFLICT_DRAFT_LABEL,
} from "@suite/website-builder/audit";
import type { PageContent } from "./contract.js";
import { syncPageMediaUsages } from "./media-usage-sync.js";

const EMPTY_PAGE_AST: PageAst = { version: 1, schemaVersion: "2026-03", sections: [] };

interface PageScope {
  readonly organizationId: string;
  readonly pageId: string;
}

interface PageLockRow extends PageScope {
  readonly id: string;
  readonly siteId: string;
  readonly revision: number;
}

interface ContentRow {
  readonly draftAst: unknown;
  readonly publishedAst: unknown;
  readonly updatedAt: Date;
}

interface LastEdit {
  readonly userId: string;
  readonly at: Date;
}

export type SaveDraftOutcome =
  | { readonly kind: "saved"; readonly content: PageContent }
  | { readonly kind: "conflict"; readonly content: PageContent; readonly retainedVersion: number };

export interface SavePageDraftInput extends PageScope {
  readonly actorUserId: string;
  readonly expectedRevision: number;
  readonly draftAst: PageAst;
}

function parseAst(value: unknown, context: string): PageAst | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = PageAstSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn({ context, issues: parsed.error.issues.slice(0, 3) }, "Stored page content does not match the AST schema");
    return null;
  }
  return parsed.data;
}

async function lockPage(tx: Prisma.TransactionClient, scope: PageScope): Promise<PageLockRow> {
  const rows = await tx.$queryRaw<PageLockRow[]>(Prisma.sql`
    SELECT "id", "organizationId", "siteId", "revision" FROM "cms"."cms_pages"
     WHERE "id" = ${scope.pageId} AND "organizationId" = ${scope.organizationId}
     FOR UPDATE
  `);
  const page = rows[0];
  if (page === undefined) {
    throw new NotFoundError("The requested page was not found.", { code: "NOT_FOUND" });
  }
  return page;
}

async function readContent(tx: Prisma.TransactionClient, scope: PageScope): Promise<ContentRow | null> {
  return tx.cmsPageContent.findFirst({
    where: { organizationId: scope.organizationId, pageId: scope.pageId },
    select: { draftAst: true, publishedAst: true, updatedAt: true },
  });
}

async function readLastEdit(tx: Prisma.TransactionClient, scope: PageScope): Promise<LastEdit | null> {
  const row = await tx.cmsAuditTrail.findFirst({
    where: {
      organizationId: scope.organizationId,
      entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
      entityId: scope.pageId,
      action: CMS_AUDIT_ACTIONS.PAGE_CONTENT_SAVED,
    },
    orderBy: { createdAt: "desc" },
    select: { actorUserId: true, createdAt: true },
  });
  return row === null ? null : { userId: row.actorUserId, at: row.createdAt };
}

interface PageContentInput {
  readonly pageId: string;
  readonly revision: number;
  readonly content: ContentRow | null;
  readonly lastEdit: LastEdit | null;
  readonly draftAst: PageAst;
  readonly publishedAst: PageAst | null;
  readonly media: MediaAssetResolutionMap;
}

function toPageContent(input: PageContentInput): PageContent {
  return {
    pageId: input.pageId,
    revision: input.revision,
    draftAst: input.draftAst,
    publishedAst: input.publishedAst,
    media: input.media,
    updatedAt: (input.content?.updatedAt ?? new Date()).toISOString(),
    lastEditedByUserId: input.lastEdit?.userId ?? null,
    lastEditedAt: input.lastEdit?.at.toISOString() ?? null,
  };
}

function assetIdsOf(...asts: readonly (PageAst | null)[]): string[] {
  const ids = new Set<string>();
  for (const ast of asts) {
    if (ast === null) {
      continue;
    }
    for (const assetId of collectMediaAssetIds(ast)) {
      ids.add(assetId);
    }
  }
  return [...ids];
}

async function resolveContentMedia(
  tx: Prisma.TransactionClient,
  organizationId: string,
  draftAst: PageAst,
  publishedAst: PageAst | null
): Promise<MediaAssetResolutionMap> {
  return resolveMediaAssets(
    tx,
    organizationId,
    assetIdsOf(draftAst, publishedAst)
  );
}

function parsedDraft(content: ContentRow | null): PageAst {
  return parseAst(content?.draftAst, "draftAst") ?? EMPTY_PAGE_AST;
}

async function nextVersionNumber(tx: Prisma.TransactionClient, scope: PageScope): Promise<number> {
  const latest = await tx.cmsPageVersion.aggregate({
    where: { organizationId: scope.organizationId, pageId: scope.pageId },
    _max: { versionNumber: true },
  });
  return (latest._max.versionNumber ?? 0) + 1;
}

interface RetainDraftInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: SavePageDraftInput;
  readonly page: PageLockRow;
}

async function retainLosingDraft(context: RetainDraftInput): Promise<number> {
  const scope: PageScope = { organizationId: context.page.organizationId, pageId: context.page.id };
  const versionNumber = await nextVersionNumber(context.tx, scope);
  await context.tx.cmsPageVersion.create({
    data: {
      organizationId: context.page.organizationId,
      pageId: context.page.id,
      versionNumber,
      label: CMS_CONFLICT_DRAFT_LABEL,
      astSnapshot: context.input.draftAst as unknown as Prisma.InputJsonValue,
      createdByUserId: context.input.actorUserId,
    },
  });
  await writeCmsAudit(context.tx, {
    organizationId: context.page.organizationId,
    siteId: context.page.siteId,
    action: CMS_AUDIT_ACTIONS.PAGE_CONTENT_CONFLICT_RETAINED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
    entityId: context.page.id,
    actorUserId: context.input.actorUserId,
    changes: {
      expectedRevision: context.input.expectedRevision,
      currentRevision: context.page.revision,
      retainedVersion: versionNumber,
    },
  });
  return versionNumber;
}

interface ApplyDraftInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: SavePageDraftInput;
  readonly page: PageLockRow;
}

async function writeDraftRevision(
  context: ApplyDraftInput,
  nextRevision: number
): Promise<ContentRow> {
  const updated = await context.tx.cmsPage.updateMany({
    where: {
      id: context.page.id,
      organizationId: context.page.organizationId,
      revision: context.page.revision,
    },
    data: { revision: nextRevision },
  });
  if (updated.count === 0) {
    throw new ConflictError("The page changed while it was saving. Reload and try again.", {
      code: "VERSION_CONFLICT",
    });
  }
  return context.tx.cmsPageContent.upsert({
    where: {
      pageId_organizationId: {
        pageId: context.page.id,
        organizationId: context.page.organizationId,
      },
    },
    create: {
      organizationId: context.page.organizationId,
      pageId: context.page.id,
      draftAst: context.input.draftAst as unknown as Prisma.InputJsonValue,
    },
    update: { draftAst: context.input.draftAst as unknown as Prisma.InputJsonValue },
    select: { draftAst: true, publishedAst: true, updatedAt: true },
  });
}

async function auditDraftSaved(
  context: ApplyDraftInput,
  nextRevision: number
): Promise<void> {
  await writeCmsAudit(context.tx, {
    organizationId: context.page.organizationId,
    siteId: context.page.siteId,
    action: CMS_AUDIT_ACTIONS.PAGE_CONTENT_SAVED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
    entityId: context.page.id,
    actorUserId: context.input.actorUserId,
    changes: {
      previousRevision: context.page.revision,
      revision: nextRevision,
      sectionCount: context.input.draftAst.sections.length,
    },
  });
}

async function applyDraftUpdate(context: ApplyDraftInput): Promise<PageContent> {
  const nextRevision = context.page.revision + 1;
  const content = await writeDraftRevision(context, nextRevision);
  await syncPageMediaUsages({
    tx: context.tx,
    organizationId: context.page.organizationId,
    actorUserId: context.input.actorUserId,
    pageId: context.page.id,
    ast: context.input.draftAst,
    status: "DRAFT",
  });
  await auditDraftSaved(context, nextRevision);
  const publishedAst = parseAst(content.publishedAst, "publishedAst");
  return {
    pageId: context.page.id,
    revision: nextRevision,
    draftAst: context.input.draftAst,
    publishedAst,
    media: await resolveContentMedia(
      context.tx,
      context.page.organizationId,
      context.input.draftAst,
      publishedAst
    ),
    updatedAt: content.updatedAt.toISOString(),
    lastEditedByUserId: context.input.actorUserId,
    lastEditedAt: new Date().toISOString(),
  };
}

/** Reads the tenant-scoped draft; a page from another workspace is not found. */
export async function getPageContent(input: PageScope): Promise<PageContent> {
  return withTenantContext(input.organizationId, async (tx) => {
    const page = await tx.cmsPage.findFirst({
      where: { id: input.pageId, organizationId: input.organizationId },
      select: { id: true, revision: true },
    });
    if (page === null) {
      throw new NotFoundError("The requested page was not found.", { code: "NOT_FOUND" });
    }
    const [content, lastEdit] = await Promise.all([readContent(tx, input), readLastEdit(tx, input)]);
    const draftAst = parsedDraft(content);
    const publishedAst = parseAst(content?.publishedAst, "publishedAst");
    return toPageContent({
      pageId: page.id,
      revision: page.revision,
      content,
      lastEdit,
      draftAst,
      publishedAst,
      media: await resolveContentMedia(
        tx,
        input.organizationId,
        draftAst,
        publishedAst
      ),
    });
  });
}

/**
 * Saves a draft only when the caller's revision is still current (CT-3). A stale
 * save retains the submitted draft in immutable version history, writes the
 * audit row, and reports a conflict without touching the newer content.
 */
export async function savePageDraft(input: SavePageDraftInput): Promise<SaveDraftOutcome> {
  return withTenantContext(input.organizationId, async (tx) => {
    const page = await lockPage(tx, input);
    if (page.revision !== input.expectedRevision) {
      const retainedVersion = await retainLosingDraft({ tx, input, page });
      const [content, lastEdit] = await Promise.all([
        readContent(tx, input),
        readLastEdit(tx, input),
      ]);
      const draftAst = parsedDraft(content);
      const publishedAst = parseAst(content?.publishedAst, "publishedAst");
      return {
        kind: "conflict",
        content: toPageContent({
          pageId: page.id,
          revision: page.revision,
          content,
          lastEdit,
          draftAst,
          publishedAst,
          media: await resolveContentMedia(
            tx,
            input.organizationId,
            draftAst,
            publishedAst
          ),
        }),
        retainedVersion,
      };
    }
    return { kind: "saved", content: await applyDraftUpdate({ tx, input, page }) };
  });
}
