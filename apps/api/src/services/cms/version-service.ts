import { z } from "zod";
import { Prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ConflictError, NotFoundError, ValidationError } from "@suite/core/errors";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { lockPageRow, lockSiteRow } from "./locks.js";
import { asJsonObject, asNullableJsonObject, hashAst } from "./review-state.js";

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

const versionCursorSchema = z
  .object({ versionNumber: z.number().int().positive(), id: z.string().min(1).max(64) })
  .strict();

type VersionCursor = z.infer<typeof versionCursorSchema>;

export interface PageVersionRecord {
  readonly id: string;
  readonly pageId: string;
  readonly versionNumber: number;
  readonly label: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
}

function invalidCursor(cause?: unknown): ValidationError {
  return new ValidationError("Invalid page version cursor.", undefined, {
    code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    ...(cause === undefined ? {} : { cause }),
  });
}

function decodeCursor(raw: string): VersionCursor {
  if (!CURSOR_PATTERN.test(raw)) {
    throw invalidCursor();
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const result = versionCursorSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch (error: unknown) {
    throw invalidCursor(error);
  }
  throw invalidCursor();
}

function encodeCursor(version: { versionNumber: number; id: string }): string {
  return Buffer.from(
    JSON.stringify({ versionNumber: version.versionNumber, id: version.id }),
    "utf8"
  ).toString("base64url");
}

function mapVersion(version: {
  id: string;
  pageId: string;
  versionNumber: number;
  label: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}): PageVersionRecord {
  return {
    id: version.id,
    pageId: version.pageId,
    versionNumber: version.versionNumber,
    label: version.label,
    createdByUserId: version.createdByUserId,
    createdAt: version.createdAt.toISOString(),
  };
}

async function requirePage(
  organizationId: string,
  pageId: string
): Promise<{ readonly id: string; readonly siteId: string }> {
  return withTenantContext(organizationId, async (tx) => {
    const page = await tx.cmsPage.findFirst({
      where: { id: pageId, organizationId },
      select: { id: true, siteId: true },
    });
    if (page === null) {
      throw new NotFoundError("The requested page was not found.", {
        code: PLATFORM_ERROR_CODE.NOT_FOUND,
      });
    }
    return page;
  });
}

export async function listPageVersions(input: {
  readonly organizationId: string;
  readonly pageId: string;
  readonly cursor?: string;
  readonly limit: number;
}): Promise<{ readonly items: PageVersionRecord[]; readonly nextCursor: string | null }> {
  await requirePage(input.organizationId, input.pageId);
  const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
  const rows = await withTenantContext(input.organizationId, (tx) =>
    tx.cmsPageVersion.findMany({
      where: {
        organizationId: input.organizationId,
        pageId: input.pageId,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { versionNumber: { lt: cursor.versionNumber } },
                { versionNumber: cursor.versionNumber, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    })
  );
  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  return {
    items: items.map(mapVersion),
    nextCursor: rows.length > input.limit && last !== undefined ? encodeCursor(last) : null,
  };
}

export interface RestoreVersionInput {
  readonly organizationId: string;
  readonly pageId: string;
  readonly versionNumber: number;
  readonly expectedRevision: number;
  readonly actorUserId: string;
}

export interface RestoreVersionOutcome {
  readonly pageId: string;
  readonly revision: number;
  readonly restoredVersion: number;
  readonly draftAst: Prisma.JsonObject;
  readonly publishedAst: Prisma.JsonObject | null;
  readonly status: string;
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value;
}

async function loadRestoreTarget(
  tx: Prisma.TransactionClient,
  input: RestoreVersionInput
): Promise<{
  readonly page: { id: string; siteId: string; revision: number; status: string; content: { publishedAst: Prisma.JsonValue | null } | null };
  readonly version: { id: string; astSnapshot: Prisma.JsonValue };
}> {
  const page = await tx.cmsPage.findFirst({
    where: { id: input.pageId, organizationId: input.organizationId },
    include: { content: { select: { publishedAst: true } } },
  });
  if (page === null) {
    throw new NotFoundError("The requested page was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  const version = await tx.cmsPageVersion.findFirst({
    where: {
      pageId: page.id,
      organizationId: input.organizationId,
      versionNumber: input.versionNumber,
    },
    select: { id: true, astSnapshot: true },
  });
  if (version === null) {
    throw new NotFoundError("The requested version was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return { page, version };
}

async function applyDraftOnly(
  tx: Prisma.TransactionClient,
  input: RestoreVersionInput,
  target: Awaited<ReturnType<typeof loadRestoreTarget>>
): Promise<void> {
  const updated = await tx.cmsPage.updateMany({
    where: {
      id: input.pageId,
      organizationId: input.organizationId,
      revision: input.expectedRevision,
    },
    data: { revision: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("The page changed since it was loaded. Reload and retry.", {
      code: PLATFORM_ERROR_CODE.VERSION_CONFLICT,
    });
  }
  await tx.cmsPageContent.update({
    where: {
      pageId_organizationId: { pageId: input.pageId, organizationId: input.organizationId },
    },
    data: { draftAst: toInputJson(target.version.astSnapshot) },
  });
}

async function writeRestoreAudit(
  tx: Prisma.TransactionClient,
  input: RestoreVersionInput,
  target: Awaited<ReturnType<typeof loadRestoreTarget>>
): Promise<void> {
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: target.page.siteId,
    action: CMS_AUDIT_ACTIONS.VERSION_RESTORED,
    entityType: CMS_AUDIT_ENTITY_TYPES.PAGE_VERSION,
    entityId: target.version.id,
    actorUserId: input.actorUserId,
    changes: {
      pageId: input.pageId,
      versionNumber: input.versionNumber,
      revision: input.expectedRevision + 1,
      draftHash: hashAst(target.version.astSnapshot),
    },
  });
}

async function applyRestore(
  tx: Prisma.TransactionClient,
  input: RestoreVersionInput,
  target: Awaited<ReturnType<typeof loadRestoreTarget>>
): Promise<void> {
  await applyDraftOnly(tx, input, target);
  await writeRestoreAudit(tx, input, target);
}

export async function restorePageVersion(input: RestoreVersionInput): Promise<RestoreVersionOutcome> {
  return withTenantContext(input.organizationId, async (tx) => {
    const target = await loadRestoreTarget(tx, input);
    await lockSiteRow(tx, { organizationId: input.organizationId, siteId: target.page.siteId });
    await lockPageRow(tx, { organizationId: input.organizationId, pageId: input.pageId });
    await applyRestore(tx, input, target);
    return {
      pageId: input.pageId,
      revision: input.expectedRevision + 1,
      restoredVersion: input.versionNumber,
      draftAst: asJsonObject(target.version.astSnapshot),
      publishedAst: asNullableJsonObject(target.page.content?.publishedAst),
      status: target.page.status,
    };
  });
}
