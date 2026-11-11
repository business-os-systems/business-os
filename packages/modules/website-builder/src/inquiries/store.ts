import { z } from "zod";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { Prisma, prisma, withTenantContext } from "@suite/db";
import { ConflictError, NotFoundError, ValidationError } from "@suite/core/errors";
import { writeCmsAudit } from "../services/cms-audit.js";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "../audit/actions.js";
import {
  canTransitionInquiryStatus,
  CMS_INQUIRY_ERROR,
  CMS_INQUIRY_EVENT_TYPE,
  INQUIRY_SPAM_VERDICT,
  isInquiryStatus,
  type InquiryPayload,
  type InquirySpamVerdict,
  type InquiryStatus,
} from "./policy.js";

/** One captured enquiry as the domain exposes it; hashes never leave this layer. */
export interface InquiryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly pageId: string | null;
  readonly blockId: string;
  readonly status: InquiryStatus;
  readonly spamVerdict: InquirySpamVerdict | null;
  readonly payload: Record<string, unknown>;
  readonly attachments: Prisma.JsonValue;
  readonly emailHash: string | null;
  readonly submitterHash: string | null;
  readonly readAt: Date | null;
  readonly archivedAt: Date | null;
  readonly retentionExpiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface InquiryRowShape {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly pageId: string | null;
  readonly blockId: string;
  readonly status: string;
  readonly spamVerdict: string | null;
  readonly payloadJson: Prisma.JsonValue;
  readonly attachments: Prisma.JsonValue;
  readonly emailHash: string | null;
  readonly submitterHash: string | null;
  readonly readAt: Date | null;
  readonly archivedAt: Date | null;
  readonly retentionExpiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function toSpamVerdict(value: string | null): InquirySpamVerdict | null {
  const verdicts: readonly (InquirySpamVerdict | null)[] = [
    INQUIRY_SPAM_VERDICT.HONEYPOT,
    INQUIRY_SPAM_VERDICT.CHALLENGE,
    null,
  ];
  return verdicts.find((verdict) => verdict === value) ?? null;
}

function mapInquiry(row: InquiryRowShape): InquiryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    pageId: row.pageId,
    blockId: row.blockId,
    status: isInquiryStatus(row.status) ? row.status : "NEW",
    spamVerdict: toSpamVerdict(row.spamVerdict),
    payload: toJsonObject(row.payloadJson),
    attachments: row.attachments,
    emailHash: row.emailHash,
    submitterHash: row.submitterHash,
    readAt: row.readAt,
    archivedAt: row.archivedAt,
    retentionExpiresAt: row.retentionExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Resolves a PUBLISHED site to its organization through the single public
 * security-definer helper. The intake path never accepts an organization id
 * from the visitor (CWE-639).
 */
export async function resolvePublicSiteOrganization(siteId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ organizationId: string | null }[]>(Prisma.sql`
    SELECT public.cms_public_site_organization(${siteId}) AS "organizationId"
  `);
  return rows[0]?.organizationId ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True when the published AST carries a form block with this id. */
function astContainsFormBlock(ast: unknown, blockId: string): boolean {
  if (!isRecord(ast)) {
    return false;
  }
  const { sections } = ast;
  if (!Array.isArray(sections)) {
    return false;
  }
  return sections.some((section: unknown) => {
    if (!isRecord(section)) {
      return false;
    }
    const { blocks } = section;
    if (!Array.isArray(blocks)) {
      return false;
    }
    return blocks.some((block: unknown) => {
      if (!isRecord(block)) {
        return false;
      }
      return block.type === "form" && block.id === blockId;
    });
  });
}

interface BlockLookupInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly blockId: string;
}

async function findPublishedFormBlockPage(
  tx: Prisma.TransactionClient,
  input: BlockLookupInput
): Promise<string | null> {
  const pages = await tx.cmsPage.findMany({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      status: "PUBLISHED",
    },
    select: { id: true, content: { select: { publishedAst: true } } },
  });
  for (const page of pages) {
    if (astContainsFormBlock(page.content?.publishedAst, input.blockId)) {
      return page.id;
    }
  }
  return null;
}

function invalidBlock(): ValidationError {
  return new ValidationError(
    "The form block does not belong to this site's published pages.",
    [{ name: "blockId", reason: "Choose a form block from a published page of this site." }],
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
  );
}

function notPublishedSite(): NotFoundError {
  return new NotFoundError("The requested site is not available.", {
    code: PLATFORM_ERROR_CODE.NOT_FOUND,
  });
}

export interface NewInquiryInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly blockId: string;
  readonly idempotencyKey: string;
  readonly payload: InquiryPayload;
  readonly attachments: readonly InquiryPayload[];
  readonly status: InquiryStatus;
  readonly spamVerdict: InquirySpamVerdict | null;
  readonly emailHash: string | null;
  readonly submitterHash: string | null;
  readonly retentionExpiresAt: Date;
}

export interface InquiryWriteResult {
  readonly record: InquiryRecord;
  readonly isDuplicate: boolean;
}

async function findByIdempotencyKey(
  tx: Prisma.TransactionClient,
  input: Pick<NewInquiryInput, "organizationId" | "siteId" | "idempotencyKey">
): Promise<InquiryRowShape | null> {
  return tx.cmsInquiry.findFirst({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

/**
 * Resolves the published site and the page whose published AST owns the form
 * block. A block from another site (or an unpublished page) is a validation
 * failure, never an accepted orphan (FR-044).
 */
async function resolveInquiryTarget(
  tx: Prisma.TransactionClient,
  input: NewInquiryInput
): Promise<string> {
  const site = await tx.cmsSite.findFirst({
    where: {
      id: input.siteId,
      organizationId: input.organizationId,
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  if (site === null) {
    throw notPublishedSite();
  }
  const pageId = await findPublishedFormBlockPage(tx, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    blockId: input.blockId,
  });
  if (pageId === null) {
    throw invalidBlock();
  }
  return pageId;
}

function inquiryCreateData(input: NewInquiryInput & { pageId: string }) {
  return {
    organizationId: input.organizationId,
    siteId: input.siteId,
    pageId: input.pageId,
    blockId: input.blockId,
    idempotencyKey: input.idempotencyKey,
    payloadJson: input.payload,
    attachments: [...input.attachments],
    status: input.status,
    spamVerdict: input.spamVerdict,
    emailHash: input.emailHash,
    submitterHash: input.submitterHash,
    retentionExpiresAt: input.retentionExpiresAt,
  };
}

async function insertInquiry(
  tx: Prisma.TransactionClient,
  input: NewInquiryInput
): Promise<InquiryWriteResult> {
  const pageId = await resolveInquiryTarget(tx, input);
  const existing = await findByIdempotencyKey(tx, input);
  if (existing !== null) {
    return { record: mapInquiry(existing), isDuplicate: true };
  }
  const created = await tx.cmsInquiry.create({
    data: inquiryCreateData({ ...input, pageId }),
  });
  await tx.cmsInquiryEvent.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      inquiryId: created.id,
      eventType: CMS_INQUIRY_EVENT_TYPE.RECEIVED,
      payloadJson: { inquiryId: created.id, siteId: input.siteId, status: created.status },
    },
  });
  return { record: mapInquiry(created), isDuplicate: false };
}

/**
 * Captures one inquiry. A concurrent retry with the same key is resolved by
 * the unique (siteId, idempotencyKey) index: the second transaction reads the
 * winner instead of inserting a second row (FR-045, CT-4).
 */
export async function createInquiry(input: NewInquiryInput): Promise<InquiryWriteResult> {
  try {
    return await withTenantContext(input.organizationId, (tx) => insertInquiry(tx, input));
  } catch (error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await withTenantContext(input.organizationId, (tx) =>
      findByIdempotencyKey(tx, input)
    );
    if (existing === null) {
      throw error;
    }
    return { record: mapInquiry(existing), isDuplicate: true };
  }
}

const cursorSchema = z
  .object({ createdAt: z.string().datetime(), id: z.string().min(1).max(64) })
  .strict();

type InquiryCursor = z.infer<typeof cursorSchema>;

function decodeCursor(raw: string): InquiryCursor {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    );
    if (parsed.success) {
      return parsed.data;
    }
  } catch (error: unknown) {
    throw new ValidationError("Invalid inquiry pagination cursor.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      cause: error,
    });
  }
  throw new ValidationError("Invalid inquiry pagination cursor.", undefined, {
    code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
  });
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    "utf8"
  ).toString("base64url");
}

export interface InquiryListQuery {
  readonly organizationId: string;
  readonly siteId?: string;
  readonly status?: InquiryStatus;
  readonly cursor?: string;
  readonly limit: number;
}

export interface InquiryPage {
  readonly items: readonly InquiryRecord[];
  readonly nextCursor: string | null;
}

function buildInquiryWhere(
  query: InquiryListQuery,
  cursor: InquiryCursor | null
): Prisma.CmsInquiryWhereInput {
  const filters: Prisma.CmsInquiryWhereInput[] = [{ organizationId: query.organizationId }];
  if (query.siteId !== undefined) {
    filters.push({ siteId: query.siteId });
  }
  if (query.status !== undefined) {
    filters.push({ status: query.status });
  }
  if (cursor !== null) {
    filters.push({
      OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ],
    });
  }
  return { AND: filters };
}

/** Lists a stable page, newest first, scoped to one workspace by RLS. */
export async function listInquiries(query: InquiryListQuery): Promise<InquiryPage> {
  const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
  return withTenantContext(query.organizationId, async (tx) => {
    const rows = await tx.cmsInquiry.findMany({
      where: buildInquiryWhere(query, cursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return {
      items: items.map(mapInquiry),
      nextCursor:
        rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  });
}

export async function getInquiry(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
}): Promise<InquiryRecord | null> {
  const row = await withTenantContext(input.organizationId, (tx) =>
    tx.cmsInquiry.findFirst({
      where: { id: input.inquiryId, organizationId: input.organizationId },
    })
  );
  return row === null ? null : mapInquiry(row);
}

/**
 * Reads one inquiry and writes the PII-read audit row in the same transaction.
 * If the audit cannot be written the personal data is never returned (FR-048).
 */
export async function readInquiryWithPiiAudit(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly actorUserId: string;
}): Promise<InquiryRecord | null> {
  return withTenantContext(input.organizationId, async (tx) => {
    const row = await tx.cmsInquiry.findFirst({
      where: { id: input.inquiryId, organizationId: input.organizationId },
    });
    if (row === null) {
      return null;
    }
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: row.siteId,
      action: CMS_AUDIT_ACTIONS.INQUIRY_PII_VIEWED,
      entityType: CMS_AUDIT_ENTITY_TYPES.INQUIRY,
      entityId: row.id,
      actorUserId: input.actorUserId,
      changes: { siteId: row.siteId, fields: ["name", "email", "phone"] },
    });
    return mapInquiry(row);
  });
}

export async function countUnreadInquiries(organizationId: string): Promise<number> {
  return withTenantContext(organizationId, (tx) =>
    tx.cmsInquiry.count({ where: { organizationId, status: "NEW" } })
  );
}

function conflictTransition(from: InquiryStatus, to: InquiryStatus): ConflictError {
  return new ConflictError(
    "An inquiry cannot move from " + from + " to " + to + ".",
    { code: CMS_INQUIRY_ERROR.STATUS_CONFLICT }
  );
}

interface StatusChangeInput {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly status: InquiryStatus;
  readonly actorUserId: string;
}

function statusChangeData(
  row: InquiryRowShape,
  status: InquiryStatus,
  now: Date
): Prisma.CmsInquiryUpdateInput {
  return {
    status,
    readAt: status === "READ" ? now : row.readAt,
    archivedAt: status === "ARCHIVED" ? now : row.archivedAt,
  };
}

async function applyStatusChange(
  tx: Prisma.TransactionClient,
  input: StatusChangeInput,
  row: InquiryRowShape
): Promise<InquiryRecord> {
  const from = mapInquiry(row).status;
  if (!canTransitionInquiryStatus(from, input.status)) {
    throw conflictTransition(from, input.status);
  }
  if (from === input.status) {
    return mapInquiry(row);
  }
  const updated = await tx.cmsInquiry.update({
    where: { id_organizationId: { id: row.id, organizationId: input.organizationId } },
    data: statusChangeData(row, input.status, new Date()),
  });
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: row.siteId,
    action: CMS_AUDIT_ACTIONS.INQUIRY_STATUS_CHANGED,
    entityType: CMS_AUDIT_ENTITY_TYPES.INQUIRY,
    entityId: row.id,
    actorUserId: input.actorUserId,
    changes: { before: from, after: input.status },
  });
  return mapInquiry(updated);
}

/** Moves NEW -> READ -> ARCHIVED | SPAM; every change is audited (FR-047). */
export async function updateInquiryStatus(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly status: InquiryStatus;
  readonly actorUserId: string;
}): Promise<InquiryRecord | null> {
  return withTenantContext(input.organizationId, async (tx) => {
    const row = await tx.cmsInquiry.findFirst({
      where: { id: input.inquiryId, organizationId: input.organizationId },
    });
    if (row === null) {
      return null;
    }
    return applyStatusChange(tx, input, row);
  });
}

/** Erasure path (FR-049): deletes the enquiry and records who erased it. */
export async function eraseInquiry(input: {
  readonly organizationId: string;
  readonly inquiryId: string;
  readonly actorUserId: string;
}): Promise<boolean> {
  return withTenantContext(input.organizationId, async (tx) => {
    const row = await tx.cmsInquiry.findFirst({
      where: { id: input.inquiryId, organizationId: input.organizationId },
    });
    if (row === null) {
      return false;
    }
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: row.siteId,
      action: CMS_AUDIT_ACTIONS.INQUIRY_ERASED,
      entityType: CMS_AUDIT_ENTITY_TYPES.INQUIRY,
      entityId: row.id,
      actorUserId: input.actorUserId,
      changes: { siteId: row.siteId, erasedAt: new Date().toISOString() },
    });
    await tx.cmsInquiry.delete({
      where: { id_organizationId: { id: row.id, organizationId: input.organizationId } },
    });
    return true;
  });
}

/**
 * Deletes every enquiry whose declared retention deadline has passed. The
 * security-definer helper is the only cross-tenant delete and returns a count,
 * never a row (FR-049).
 */
export async function purgeExpiredInquiries(batchSize: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ purged: number | null }[]>(Prisma.sql`
    SELECT public.cms_purge_expired_inquiries(${batchSize}::integer) AS "purged"
  `);
  return rows[0]?.purged ?? 0;
}
