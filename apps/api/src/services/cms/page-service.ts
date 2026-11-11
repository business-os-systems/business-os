import { z } from "zod";
import { Prisma, withTenantContext, type CmsPage } from "@suite/db";
import { ConflictError, NotFoundError, ValidationError } from "@suite/core/errors";
import {
  assertPagePathAllowed,
  isUniqueConstraintViolation,
  normalizePagePath,
  writeCmsAudit,
} from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import type {
  ArchivePageBody,
  CmsList,
  CmsPageRecord,
  CmsRedirectRecord,
  CreatePageBody,
  ReorderPageBody,
  UpdatePageBody,
} from "./contract.js";
import { removePageMediaUsages } from "./media-usage-sync.js";

const MAX_ANCESTOR_DEPTH = 100;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const PAGE_NOT_FOUND_DETAIL = "The requested page was not found.";
const PAGE_VERSION_CONFLICT_DETAIL =
  "The page changed since it was loaded. Reload and try again.";
const pageCursorSchema = z
  .object({
    orderIndex: z.number().int(),
    createdAt: z.string().datetime(),
    id: z.string().min(1).max(64),
  })
  .strict();

type PageCursor = z.infer<typeof pageCursorSchema>;

function emptyPageAst(): { version: number; schemaVersion: string; sections: never[] } {
  return { version: 1, schemaVersion: "2026-03", sections: [] };
}

function invalidCursor(cause?: unknown): ValidationError {
  return new ValidationError("Invalid page pagination cursor.", undefined, {
    code: "VALIDATION_FAILED",
    ...(cause === undefined ? {} : { cause }),
  });
}

function decodePageCursor(raw: string): PageCursor {
  if (!CURSOR_PATTERN.test(raw)) {
    throw invalidCursor();
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const result = pageCursorSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch (error: unknown) {
    throw invalidCursor(error);
  }
  throw invalidCursor();
}

function encodePageCursor(page: { orderIndex: number; createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      orderIndex: page.orderIndex,
      createdAt: page.createdAt.toISOString(),
      id: page.id,
    }),
    "utf8"
  ).toString("base64url");
}

function mapPage(page: {
  id: string;
  siteId: string;
  parentId: string | null;
  title: string;
  slug: string;
  orderIndex: number;
  status: string;
  isHomePage: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}): CmsPageRecord {
  return {
    id: page.id,
    siteId: page.siteId,
    parentId: page.parentId,
    title: page.title,
    path: page.slug,
    orderIndex: page.orderIndex,
    status: page.status,
    isHomePage: page.isHomePage,
    revision: page.revision,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

async function lockSite(
  tx: Prisma.TransactionClient,
  organizationId: string,
  siteId: string
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "cms"."cms_sites"
     WHERE "id" = ${siteId} AND "organizationId" = ${organizationId}
     FOR UPDATE
  `);
  if (rows.length === 0) {
    throw new NotFoundError("The requested site was not found.", { code: "NOT_FOUND" });
  }
}

async function assertParentBelongsToSite(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; siteId: string; parentId: string }
): Promise<void> {
  const parent = await tx.cmsPage.findFirst({
    where: { id: input.parentId, siteId: input.siteId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (parent === null) {
    throw new ValidationError(
      "The parent page does not belong to this site.",
      [{ name: "parentId", reason: "Choose a parent page from the same site." }],
      { code: "VALIDATION_FAILED" }
    );
  }
}

interface CycleInput {
  readonly organizationId: string;
  readonly pageId: string;
  readonly parentId: string;
}

async function walkAncestors(
  tx: Prisma.TransactionClient,
  input: CycleInput,
  currentId: string | null,
  visited: Set<string>
): Promise<void> {
  if (currentId === null) {
    return;
  }
  if (currentId === input.pageId || visited.has(currentId)) {
    throw new ValidationError(
      "A page cannot be moved inside itself.",
      [{ name: "parentId", reason: "Choose a parent outside the page's own subtree." }],
      { code: "VALIDATION_FAILED" }
    );
  }
  if (visited.size >= MAX_ANCESTOR_DEPTH) {
    throw new ValidationError(
      "The page hierarchy is deeper than this studio supports.",
      [{ name: "parentId", reason: "Choose a shallower parent." }],
      { code: "VALIDATION_FAILED" }
    );
  }
  visited.add(currentId);
  const parent: { parentId: string | null } | null = await tx.cmsPage.findFirst({
    where: { id: currentId, organizationId: input.organizationId },
    select: { parentId: true },
  });
  await walkAncestors(tx, input, parent === null ? null : parent.parentId, visited);
}

async function assertNoCycle(
  tx: Prisma.TransactionClient,
  input: CycleInput
): Promise<void> {
  await walkAncestors(tx, input, input.parentId, new Set());
}

interface HomeRuleInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly path: string;
  readonly wantsHome: boolean;
}

async function assertHomeAddressRules(
  tx: Prisma.TransactionClient,
  input: HomeRuleInput
): Promise<void> {
  const home = await tx.cmsPage.findFirst({
    where: { organizationId: input.organizationId, siteId: input.siteId, isHomePage: true },
    select: { id: true },
  });
  if (input.wantsHome && home !== null) {
    throw new ConflictError("This site already has a home page.", {
      code: "PAGE_PATH_CONFLICT",
    });
  }
  if (input.wantsHome && input.path !== "/") {
    throw new ValidationError(
      "The home page must use the root address.",
      [{ name: "path", reason: "Use / for the home page." }],
      { code: "VALIDATION_FAILED" }
    );
  }
  if (!input.wantsHome && input.path === "/") {
    throw new ConflictError("The root address belongs to the home page.", {
      code: "PAGE_PATH_CONFLICT",
    });
  }
}

async function nextOrderIndex(
  tx: Prisma.TransactionClient,
  organizationId: string,
  siteId: string
): Promise<number> {
  const last = await tx.cmsPage.aggregate({
    where: { organizationId, siteId },
    _max: { orderIndex: true },
  });
  return (last._max.orderIndex ?? -1) + 1;
}

interface CreatePageTxInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly actorUserId: string;
  readonly body: CreatePageBody;
  readonly path: string;
}

async function createPageTx(
  tx: Prisma.TransactionClient,
  input: CreatePageTxInput
): Promise<CmsPageRecord> {
  await lockSite(tx, input.organizationId, input.siteId);
  const parentId = input.body.parentId ?? null;
  if (parentId !== null) {
    await assertParentBelongsToSite(tx, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      parentId,
    });
  }
  const wantsHome = input.body.isHomePage === true || input.path === "/";
  await assertHomeAddressRules(tx, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    path: input.path,
    wantsHome,
  });
  const page = await tx.cmsPage.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      parentId,
      title: input.body.title,
      slug: input.path,
      isHomePage: wantsHome,
      orderIndex: await nextOrderIndex(tx, input.organizationId, input.siteId),
      status: "DRAFT",
      revision: 1,
      content: { create: { draftAst: emptyPageAst() } },
    },
  });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    action: CMS_AUDIT_ACTIONS.PAGE_CREATED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
    entityId: page.id,
    actorUserId: input.actorUserId,
    changes: { title: page.title, path: page.slug, parentId: page.parentId },
  });
  return mapPage(page);
}

/** Lists one site's page tree, ordered by tree position then creation, cursor paginated. */
export async function listPages(input: {
  readonly organizationId: string;
  readonly siteId: string;
  readonly cursor?: string;
  readonly limit: number;
}): Promise<CmsList<CmsPageRecord>> {
  const cursor = input.cursor === undefined ? null : decodePageCursor(input.cursor);
  return withTenantContext(input.organizationId, async (tx) => {
    const site = await tx.cmsSite.findFirst({
      where: { id: input.siteId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (site === null) {
      throw new NotFoundError("The requested site was not found.", { code: "NOT_FOUND" });
    }
    const base = { organizationId: input.organizationId, siteId: input.siteId };
    const where =
      cursor === null
        ? base
        : {
            ...base,
            OR: [
              { orderIndex: { gt: cursor.orderIndex } },
              { orderIndex: cursor.orderIndex, createdAt: { gt: new Date(cursor.createdAt) } },
              {
                orderIndex: cursor.orderIndex,
                createdAt: new Date(cursor.createdAt),
                id: { gt: cursor.id },
              },
            ],
          };
    const rows = await tx.cmsPage.findMany({
      where,
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(mapPage),
      nextCursor:
        rows.length > input.limit && last !== undefined ? encodePageCursor(last) : null,
    };
  });
}

/** Reads one page; another tenant's page id is indistinguishable from not found. */
export async function getPage(input: {
  readonly organizationId: string;
  readonly pageId: string;
}): Promise<CmsPageRecord | null> {
  const page = await withTenantContext(input.organizationId, (tx) =>
    tx.cmsPage.findFirst({
      where: { id: input.pageId, organizationId: input.organizationId },
    })
  );
  return page === null ? null : mapPage(page);
}

export interface CreatePageInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly actorUserId: string;
  readonly body: CreatePageBody;
}

/** Creates one page, enforcing normalized/reserved paths and one home page. */
export async function createPage(input: CreatePageInput): Promise<CmsPageRecord> {
  const path = normalizePagePath(input.body.path);
  assertPagePathAllowed(path);
  try {
    return await withTenantContext(input.organizationId, (tx) =>
      createPageTx(tx, { ...input, path })
    );
  } catch (error: unknown) {
    throw mapPageWriteFailure(error);
  }
}

function mapPageWriteFailure(error: unknown): unknown {
  if (error instanceof ConflictError) {
    return error;
  }
  // A page row has one unique invariant a user can trip: (siteId, path).
  if (isUniqueConstraintViolation(error)) {
    return new ConflictError("A page with this address already exists.", {
      code: "PAGE_PATH_CONFLICT",
    });
  }
  return error;
}

async function assertUpdatePathRules(
  tx: Prisma.TransactionClient,
  current: { id: string; organizationId: string; siteId: string; isHomePage: boolean },
  input: UpdatePageBody,
  nextPath: string | null
): Promise<void> {
  if (current.isHomePage && nextPath !== null && nextPath !== "/") {
    throw new ValidationError(
      "The home page must keep the root address.",
      [{ name: "path", reason: "The home page cannot move away from /." }],
      { code: "VALIDATION_FAILED" }
    );
  }
  if (!current.isHomePage && nextPath === "/") {
    throw new ConflictError("The root address belongs to the home page.", {
      code: "PAGE_PATH_CONFLICT",
    });
  }
  if (input.parentId !== undefined && input.parentId !== null) {
    await assertParentBelongsToSite(tx, {
      organizationId: current.organizationId,
      siteId: current.siteId,
      parentId: input.parentId,
    });
    await assertNoCycle(tx, {
      organizationId: current.organizationId,
      pageId: current.id,
      parentId: input.parentId,
    });
  }
}

interface PageRow {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly isHomePage: boolean;
  readonly revision: number;
}

interface RedirectPlan {
  readonly organizationId: string;
  readonly siteId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
}

/**
 * A published address that changes keeps its old address alive as a permanent
 * redirect. Draft and archived pages never create one.
 */
function planPublishedRedirect(current: PageRow, nextPath: string | null): RedirectPlan | null {
  if (nextPath === null || nextPath === current.slug || current.status !== "PUBLISHED") {
    return null;
  }
  return {
    organizationId: current.organizationId,
    siteId: current.siteId,
    sourcePath: current.slug,
    targetPath: nextPath,
  };
}

/**
 * Writes the redirect in the page's own transaction. Any redirect that pointed
 * at the old address is flattened to the new address, and a stale redirect that
 * occupied the new address is removed so the page itself stays reachable. That
 * keeps chains at one hop and makes (siteId, sourcePath) the single invariant.
 */
async function writePermanentRedirect(
  tx: Prisma.TransactionClient,
  plan: RedirectPlan
): Promise<void> {
  await tx.cmsUrlRedirect.deleteMany({
    where: { organizationId: plan.organizationId, siteId: plan.siteId, sourcePath: plan.targetPath },
  });
  await tx.cmsUrlRedirect.updateMany({
    where: { organizationId: plan.organizationId, siteId: plan.siteId, targetUrl: plan.sourcePath },
    data: { targetUrl: plan.targetPath },
  });
  await tx.cmsUrlRedirect.upsert({
    where: { siteId_sourcePath: { siteId: plan.siteId, sourcePath: plan.sourcePath } },
    create: {
      organizationId: plan.organizationId,
      siteId: plan.siteId,
      sourcePath: plan.sourcePath,
      targetUrl: plan.targetPath,
      type: "PERMANENT",
    },
    update: { targetUrl: plan.targetPath, type: "PERMANENT" },
  });
}

async function applyPageUpdate(
  tx: Prisma.TransactionClient,
  current: PageRow,
  input: UpdatePageBody,
  nextPath: string | null
): Promise<CmsPage> {
  const updated = await tx.cmsPage.updateMany({
    where: {
      id: current.id,
      organizationId: current.organizationId,
      revision: input.expectedRevision,
    },
    data: {
      title: input.title,
      slug: nextPath ?? undefined,
      parentId: input.parentId,
      revision: current.revision + 1,
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(PAGE_VERSION_CONFLICT_DETAIL, {
      code: "VERSION_CONFLICT",
    });
  }
  return tx.cmsPage.findFirstOrThrow({
    where: { id: current.id, organizationId: current.organizationId },
  });
}

export interface UpdatePageInput {
  readonly organizationId: string;
  readonly pageId: string;
  readonly actorUserId: string;
  readonly body: UpdatePageBody;
}

/** Renames or moves a page, rejecting stale revisions (CT-3). */
export async function updatePage(input: UpdatePageInput): Promise<CmsPageRecord> {
  const nextPath = input.body.path === undefined ? null : normalizePagePath(input.body.path);
  if (nextPath !== null) {
    assertPagePathAllowed(nextPath);
  }
  try {
    return await withTenantContext(input.organizationId, async (tx) => {
      const current: PageRow | null = await tx.cmsPage.findFirst({
        where: { id: input.pageId, organizationId: input.organizationId },
      });
      if (current === null) {
        throw new NotFoundError("The requested page was not found.", { code: "NOT_FOUND" });
      }
      await lockSite(tx, input.organizationId, current.siteId);
      if (current.revision !== input.body.expectedRevision) {
        throw new ConflictError(PAGE_VERSION_CONFLICT_DETAIL, {
          code: "VERSION_CONFLICT",
        });
      }
      await assertUpdatePathRules(tx, current, input.body, nextPath);
      const redirect = planPublishedRedirect(current, nextPath);
      const page = await applyPageUpdate(tx, current, input.body, nextPath);
      if (redirect !== null) {
        await writePermanentRedirect(tx, redirect);
      }
      const changes: Prisma.InputJsonObject = {
        before: { title: current.title, path: current.slug, parentId: current.parentId },
        after: { title: page.title, path: page.slug, parentId: page.parentId },
        ...(redirect === null
          ? {}
          : {
              redirect: {
                sourcePath: redirect.sourcePath,
                targetPath: redirect.targetPath,
                type: "PERMANENT",
              },
            }),
      };
      await writeCmsAudit(tx, {
        organizationId: input.organizationId,
        siteId: current.siteId,
        action:
          nextPath !== null || input.body.parentId !== undefined
            ? CMS_AUDIT_ACTIONS.PAGE_MOVED
            : CMS_AUDIT_ACTIONS.PAGE_RENAMED,
        entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
        entityId: page.id,
        actorUserId: input.actorUserId,
        changes,
      });
      return mapPage(page);
    });
  } catch (error: unknown) {
    throw mapPageWriteFailure(error);
  }
}

/** Deletes a page; the home page and the last remaining page are refused. */
export async function deletePage(input: {
  readonly organizationId: string;
  readonly pageId: string;
  readonly actorUserId: string;
}): Promise<{ deleted: true }> {
  return withTenantContext(input.organizationId, async (tx) => {
    const current = await tx.cmsPage.findFirst({
      where: { id: input.pageId, organizationId: input.organizationId },
    });
    if (current === null) {
      throw new NotFoundError("The requested page was not found.", { code: "NOT_FOUND" });
    }
    await lockSite(tx, input.organizationId, current.siteId);
    if (current.isHomePage) {
      throw new ConflictError("The home page cannot be deleted.", {
        code: "PAGE_TREE_PROTECTED",
      });
    }
    const count = await tx.cmsPage.count({
      where: { organizationId: input.organizationId, siteId: current.siteId },
    });
    if (count <= 1) {
      throw new ConflictError("A site must keep at least one page.", {
        code: "PAGE_TREE_PROTECTED",
      });
    }
    await removePageMediaUsages({
      tx,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      pageId: current.id,
    });
    await tx.cmsPage.delete({
      where: { id_organizationId: { id: current.id, organizationId: input.organizationId } },
    });
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: current.siteId,
      action: CMS_AUDIT_ACTIONS.PAGE_DELETED,
      entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
      entityId: current.id,
      actorUserId: input.actorUserId,
      changes: { title: current.title, path: current.slug },
    });
    return { deleted: true as const };
  });
}

/** Canonical page status values used by the tree mutations (cms_pages.status). */
const PAGE_STATUS = {
  DRAFT: "DRAFT",
  ARCHIVED: "ARCHIVED",
} as const;

const DUPLICATE_PATH_MAX_ATTEMPTS = 50;
const PAGE_TITLE_MAX_LENGTH = 160;
const COPY_SUFFIX = " (copy)";

function pageNotFound(): NotFoundError {
  return new NotFoundError(PAGE_NOT_FOUND_DETAIL, { code: "NOT_FOUND" });
}

interface PageMutationInput {
  readonly organizationId: string;
  readonly pageId: string;
  readonly actorUserId: string;
}

async function findPageOrThrow(
  tx: Prisma.TransactionClient,
  input: PageMutationInput
): Promise<CmsPage> {
  const page = await tx.cmsPage.findFirst({
    where: { id: input.pageId, organizationId: input.organizationId },
  });
  if (page === null) {
    throw pageNotFound();
  }
  return page;
}

function assertCurrentRevision(current: { revision: number }, expectedRevision: number): void {
  if (current.revision !== expectedRevision) {
    throw new ConflictError(PAGE_VERSION_CONFLICT_DETAIL, { code: "VERSION_CONFLICT" });
  }
}

async function findReorderNeighbor(
  tx: Prisma.TransactionClient,
  input: ReorderPageInput,
  current: CmsPage
): Promise<CmsPage | null> {
  const movingUp = input.body.direction === "up";
  return tx.cmsPage.findFirst({
    where: {
      organizationId: input.organizationId,
      siteId: current.siteId,
      parentId: current.parentId,
      status: { not: PAGE_STATUS.ARCHIVED },
      id: { not: current.id },
      orderIndex: movingUp ? { lt: current.orderIndex } : { gt: current.orderIndex },
    },
    orderBy: movingUp ? { orderIndex: "desc" } : { orderIndex: "asc" },
  });
}

interface ReorderPageInput extends PageMutationInput {
  readonly body: ReorderPageBody;
}

async function swapPageOrder(
  tx: Prisma.TransactionClient,
  input: ReorderPageInput,
  current: CmsPage,
  neighbor: CmsPage
): Promise<CmsPage> {
  await tx.cmsPage.update({
    where: { id_organizationId: { id: current.id, organizationId: input.organizationId } },
    data: { orderIndex: neighbor.orderIndex, revision: { increment: 1 } },
  });
  await tx.cmsPage.update({
    where: { id_organizationId: { id: neighbor.id, organizationId: input.organizationId } },
    data: { orderIndex: current.orderIndex, revision: { increment: 1 } },
  });
  const moved = await tx.cmsPage.findFirstOrThrow({
    where: { id: current.id, organizationId: input.organizationId },
  });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: current.siteId,
    action: CMS_AUDIT_ACTIONS.PAGE_MOVED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
    entityId: current.id,
    actorUserId: input.actorUserId,
    changes: {
      reason: "REORDER",
      direction: input.body.direction,
      beforeOrderIndex: current.orderIndex,
      afterOrderIndex: neighbor.orderIndex,
      neighborPageId: neighbor.id,
    },
  });
  return moved;
}

async function reorderPageTx(
  tx: Prisma.TransactionClient,
  input: ReorderPageInput
): Promise<CmsPageRecord> {
  const current = await findPageOrThrow(tx, input);
  await lockSite(tx, input.organizationId, current.siteId);
  assertCurrentRevision(current, input.body.expectedRevision);
  if (current.status === PAGE_STATUS.ARCHIVED) {
    throw new ConflictError("An archived page cannot be reordered.", {
      code: "PAGE_TREE_PROTECTED",
    });
  }
  const neighbor = await findReorderNeighbor(tx, input, current);
  return neighbor === null ? mapPage(current) : mapPage(await swapPageOrder(tx, input, current, neighbor));
}

/**
 * Moves a page one slot among its non-archived siblings. The site row is locked
 * so two reorders cannot interleave, and both revisions advance so a stale
 * rename still loses to the reorder (CT-3).
 */
export async function reorderPage(input: ReorderPageInput): Promise<CmsPageRecord> {
  try {
    return await withTenantContext(input.organizationId, (tx) => reorderPageTx(tx, input));
  } catch (error: unknown) {
    throw mapPageWriteFailure(error);
  }
}

async function nextDuplicatePath(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; siteId: string; source: CmsPage }
): Promise<string> {
  const base = input.source.isHomePage ? "/home" : input.source.slug;
  const rows = await tx.cmsPage.findMany({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      slug: { startsWith: base + "-copy" },
    },
    select: { slug: true },
  });
  const taken = new Set(rows.map((row) => row.slug));
  for (let attempt = 1; attempt <= DUPLICATE_PATH_MAX_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? base + "-copy" : base + "-copy-" + String(attempt);
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new ConflictError("This page has been duplicated too many times. Rename the copies first.", {
    code: "PAGE_PATH_CONFLICT",
  });
}

function duplicateTitle(title: string): string {
  return title.slice(0, PAGE_TITLE_MAX_LENGTH - COPY_SUFFIX.length) + COPY_SUFFIX;
}

async function duplicatePageTx(
  tx: Prisma.TransactionClient,
  input: PageMutationInput
): Promise<CmsPageRecord> {
  const source = await tx.cmsPage.findFirst({
    where: { id: input.pageId, organizationId: input.organizationId },
    include: { content: { select: { draftAst: true } } },
  });
  if (source === null) {
    throw pageNotFound();
  }
  await lockSite(tx, input.organizationId, source.siteId);
  const path = await nextDuplicatePath(tx, {
    organizationId: input.organizationId,
    siteId: source.siteId,
    source,
  });
  await tx.cmsPage.updateMany({
    where: {
      organizationId: input.organizationId,
      siteId: source.siteId,
      parentId: source.parentId,
      orderIndex: { gte: source.orderIndex + 1 },
    },
    data: { orderIndex: { increment: 1 } },
  });
  const created = await tx.cmsPage.create({
    data: {
      organizationId: input.organizationId,
      siteId: source.siteId,
      parentId: source.parentId,
      title: duplicateTitle(source.title),
      slug: path,
      isHomePage: false,
      orderIndex: source.orderIndex + 1,
      status: PAGE_STATUS.DRAFT,
      revision: 1,
      content: { create: { draftAst: source.content?.draftAst ?? emptyPageAst() } },
    },
  });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: source.siteId,
    action: CMS_AUDIT_ACTIONS.PAGE_CREATED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
    entityId: created.id,
    actorUserId: input.actorUserId,
    changes: {
      sourcePageId: source.id,
      title: created.title,
      path: created.slug,
      parentId: created.parentId,
    },
  });
  return mapPage(created);
}

/**
 * Duplicates a page beside its source: the same parent, the next tree slot, a
 * unique copy address and a copy of the draft content. The copy is never a home
 * page and never inherits a published status (FR-020, FR-080).
 */
export async function duplicatePage(input: PageMutationInput): Promise<CmsPageRecord> {
  try {
    return await withTenantContext(input.organizationId, (tx) => duplicatePageTx(tx, input));
  } catch (error: unknown) {
    throw mapPageWriteFailure(error);
  }
}

interface ArchivePageInput extends PageMutationInput {
  readonly body: ArchivePageBody;
}

async function assertArchiveable(
  tx: Prisma.TransactionClient,
  input: ArchivePageInput,
  current: CmsPage
): Promise<void> {
  if (current.isHomePage) {
    throw new ConflictError("The home page cannot be archived.", {
      code: "PAGE_TREE_PROTECTED",
    });
  }
  if (current.status === PAGE_STATUS.ARCHIVED) {
    throw new ConflictError("This page is already archived.", {
      code: "PAGE_TREE_PROTECTED",
    });
  }
  const livePages = await tx.cmsPage.count({
    where: {
      organizationId: input.organizationId,
      siteId: current.siteId,
      status: { not: PAGE_STATUS.ARCHIVED },
    },
  });
  if (livePages <= 1) {
    throw new ConflictError("A site must keep at least one live page.", {
      code: "PAGE_TREE_PROTECTED",
    });
  }
  const liveChildren = await tx.cmsPage.count({
    where: {
      organizationId: input.organizationId,
      siteId: current.siteId,
      parentId: current.id,
      status: { not: PAGE_STATUS.ARCHIVED },
    },
  });
  if (liveChildren > 0) {
    throw new ConflictError("Move or archive the child pages first.", {
      code: "PAGE_TREE_PROTECTED",
    });
  }
}

async function archivePageTx(
  tx: Prisma.TransactionClient,
  input: ArchivePageInput
): Promise<CmsPageRecord> {
  const current = await findPageOrThrow(tx, input);
  await lockSite(tx, input.organizationId, current.siteId);
  assertCurrentRevision(current, input.body.expectedRevision);
  await assertArchiveable(tx, input, current);
  const archived = await tx.cmsPage.update({
    where: { id_organizationId: { id: current.id, organizationId: input.organizationId } },
    data: { status: PAGE_STATUS.ARCHIVED, revision: { increment: 1 } },
  });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: current.siteId,
    action: CMS_AUDIT_ACTIONS.PAGE_DELETED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE,
    entityId: current.id,
    actorUserId: input.actorUserId,
    changes: {
      archived: true,
      title: current.title,
      path: current.slug,
      previousStatus: current.status,
    },
  });
  return mapPage(archived);
}

/**
 * Archives a page: its content, address and position are retained, but the
 * storefront and the editor tree stop treating it as live. The home page, the
 * last live page and a parent with live children are refused so a site never
 * loses its entry point or orphans a branch (FR-020).
 */
export async function archivePage(input: ArchivePageInput): Promise<CmsPageRecord> {
  return withTenantContext(input.organizationId, (tx) => archivePageTx(tx, input));
}

const redirectCursorSchema = z
  .object({ createdAt: z.string().datetime(), id: z.string().min(1).max(64) })
  .strict();

type RedirectCursor = z.infer<typeof redirectCursorSchema>;

function encodeRedirectCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    "utf8"
  ).toString("base64url");
}

function decodeRedirectCursor(raw: string): RedirectCursor {
  if (!CURSOR_PATTERN.test(raw)) {
    throw invalidCursor();
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const result = redirectCursorSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch (error: unknown) {
    throw invalidCursor(error);
  }
  throw invalidCursor();
}

/** Lists the permanent redirects page moves created, newest first (FR-082). */
export async function listRedirects(input: {
  readonly organizationId: string;
  readonly siteId: string;
  readonly cursor?: string;
  readonly limit: number;
}): Promise<CmsList<CmsRedirectRecord>> {
  const cursor = input.cursor === undefined ? null : decodeRedirectCursor(input.cursor);
  return withTenantContext(input.organizationId, async (tx) => {
    const site = await tx.cmsSite.findFirst({
      where: { id: input.siteId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (site === null) {
      throw new NotFoundError("The requested site was not found.", { code: "NOT_FOUND" });
    }
    const where =
      cursor === null
        ? { organizationId: input.organizationId, siteId: input.siteId }
        : {
            organizationId: input.organizationId,
            siteId: input.siteId,
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          };
    const rows = await tx.cmsUrlRedirect.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    const last = items[items.length - 1];
    return {
      items: items.map((row) => ({
        id: row.id,
        siteId: row.siteId,
        sourcePath: row.sourcePath,
        targetPath: row.targetUrl,
        type: row.type,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > input.limit && last !== undefined ? encodeRedirectCursor(last) : null,
    };
  });
}
