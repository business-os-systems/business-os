import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  SUPPORT_SESSION_TENANT_ACTOR_PREFIX,
  TENANT_STATUS,
} from "@suite/core";
import { ConflictError, NotFoundError, ValidationError } from "@suite/core/errors";
import {
  appendPlatformAuditEvent,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import {
  getControlSessionSecret,
  getImpersonationMaxMinutes,
} from "../../lib/platform-env.js";
import { signImpersonationTicket } from "./impersonation-ticket.js";
import { readTenantOverview } from "./tenant-view.service.js";

/** FR-047: a support session can never outlive thirty minutes. */
export const MAXIMUM_IMPERSONATION_MINUTES = 30;
export const DEFAULT_SUPPORT_SESSION_HISTORY_LIMIT = 20;
export const MAXIMUM_SUPPORT_SESSION_HISTORY_LIMIT = 50;
export const TENANT_ACTOR_PREFIX = SUPPORT_SESSION_TENANT_ACTOR_PREFIX;

const IMPERSONATION_ENTITY_TYPE = "impersonation_session";
const MAXIMUM_ACTIVE_SESSIONS = 20;
const SUPPORT_SESSION_LOCK_PREFIX = "platform:support-session:";

export interface StartImpersonationInput {
  readonly organizationId: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly targetUserId?: string;
  readonly operatorId: string;
  readonly requestId: string;
  /** Resolved from the trusted-proxy chain; null when no address is known. */
  readonly ip: string | null;
  /** Diagnostic only, already bounded by the route. */
  readonly userAgent: string | null;
}

export interface StartImpersonationResult {
  readonly ticketId: string;
  readonly expiresAt: string;
  readonly tenantBannerToken: string;
}

/**
 * Who is allowed to see the session being ended. The two termination paths have
 * different scopes, so they are a discriminated union rather than optional
 * fields that only one variant uses.
 */
export type EndImpersonationScope =
  | { readonly kind: "operator"; readonly operatorId: string }
  | { readonly kind: "tenant"; readonly organizationId: string };

export interface EndImpersonationInput {
  readonly ticketId: string;
  readonly scope: EndImpersonationScope;
  readonly endedBy: string;
  readonly requestId: string;
  /** null when a tenant administrator ends the session (no operator actor). */
  readonly actorOperatorId: string | null;
}

function scopeFilter(
  scope: EndImpersonationScope
): Prisma.ImpersonationSessionWhereInput {
  return scope.kind === "operator"
    ? { operatorId: scope.operatorId }
    : { organizationId: scope.organizationId };
}

export interface EndImpersonationResult {
  readonly endedAt: string;
  readonly endedBy: string;
}

export interface ActiveSupportSession {
  readonly ticketId: string;
  readonly operatorDisplayName: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly startedAt: string;
  readonly expiresAt: string;
}

export interface OperatorSupportSession {
  readonly ticketId: string;
  readonly organizationId: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly startedAt: string;
  readonly expiresAt: string;
}

export interface SupportSessionHistoryItem {
  readonly ticketId: string;
  readonly operatorDisplayName: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly endedAt: string | null;
  readonly endedBy: string | null;
}

export interface SupportSessionHistoryPage {
  readonly items: SupportSessionHistoryItem[];
  readonly nextCursor: string | null;
}

export interface SupportSessionHistoryInput {
  readonly organizationId: string;
  readonly cursor?: string;
  readonly limit: number;
}

interface HistoryRow {
  readonly id: string;
  readonly ticketId: string;
  readonly operatorDisplayName: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly startedAt: Date;
  readonly startedAtCursor: string;
  readonly expiresAt: Date;
  readonly endedAt: Date | null;
  readonly endedBy: string | null;
}

function activeWithin(now: Date): Prisma.ImpersonationSessionWhereInput {
  return { endedAt: null, expiresAt: { gt: now } };
}

function supportSessionMinutes(): number {
  return Math.min(getImpersonationMaxMinutes(), MAXIMUM_IMPERSONATION_MINUTES);
}

export function tenantActorReference(userId: string): string {
  return `${TENANT_ACTOR_PREFIX}${userId}`;
}

interface SessionTiming {
  readonly startedAt: Date;
  readonly expiresAt: Date;
}

interface StartedSession {
  readonly ticketId: string;
  readonly timing: SessionTiming;
}

async function assertTenantCanSupportSession(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  const tenant = await readTenantOverview(tx, organizationId);
  if (tenant === null) {
    throw new NotFoundError("Tenant not found.", {
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    });
  }
  if (tenant.status !== TENANT_STATUS.ACTIVE) {
    throw new ValidationError(
      "The tenant must be active before a support session can start.",
      [{ name: "organizationId", reason: "The tenant is not active." }],
      { code: PLATFORM_ERROR_CODE.TENANT_NOT_ACTIVE }
    );
  }
}

/**
 * Serializes the one-active-session invariant per operator across API instances.
 * Without the transaction-scoped lock, two concurrent starts can each observe no
 * active session and both insert (T127, CT-1). The lock is released at commit,
 * so the second transaction's read sees the first session and returns 409.
 */
async function lockOperatorSupportSessions(
  tx: Prisma.TransactionClient,
  operatorId: string
): Promise<void> {
  const lockKey = `${SUPPORT_SESSION_LOCK_PREFIX}${operatorId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS locked`;
}

async function assertNoActiveSupportSession(
  tx: Prisma.TransactionClient,
  operatorId: string,
  now: Date
): Promise<void> {
  const existing = await tx.impersonationSession.findFirst({
    where: { operatorId, ...activeWithin(now) },
    select: { id: true },
  });
  if (existing !== null) {
    throw new ConflictError(
      "This operator already has an active support session.",
      { code: PLATFORM_ERROR_CODE.IMPERSONATION_ALREADY_ACTIVE }
    );
  }
}

async function insertSupportSession(
  tx: Prisma.TransactionClient,
  input: StartImpersonationInput,
  session: StartedSession
): Promise<void> {
  await tx.impersonationSession.create({
    data: {
      ticketId: session.ticketId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      targetUserId: input.targetUserId ?? null,
      reason: input.reason.trim(),
      ticketRef: input.ticketRef.trim(),
      startedAt: session.timing.startedAt,
      expiresAt: session.timing.expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

async function auditSupportSessionStarted(
  tx: Prisma.TransactionClient,
  input: StartImpersonationInput,
  session: StartedSession
): Promise<void> {
  await appendPlatformAuditEvent(tx, {
    actorOperatorId: input.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.IMPERSONATION_STARTED,
    entityType: IMPERSONATION_ENTITY_TYPE,
    entityId: session.ticketId,
    organizationId: input.organizationId,
    before: null,
    after: {
      organizationId: input.organizationId,
      targetUserId: input.targetUserId ?? null,
      reason: input.reason.trim(),
      ticketRef: input.ticketRef.trim(),
      expiresAt: session.timing.expiresAt.toISOString(),
    },
    requestId: input.requestId,
  });
}

/**
 * Starts one time-boxed support session. The insert and the audit row share a
 * transaction, so a support session can never exist without its record
 * (FR-045..FR-047, invariant 4).
 */
export async function startImpersonation(
  prisma: PrismaClient,
  input: StartImpersonationInput
): Promise<StartImpersonationResult> {
  const now = new Date();
  const ticketId = randomUUID();
  const timing: SessionTiming = {
    startedAt: now,
    expiresAt: new Date(now.getTime() + supportSessionMinutes() * 60_000),
  };
  const session: StartedSession = { ticketId, timing };
  const secret = getControlSessionSecret();

  return prisma.$transaction(async (tx) => {
    await lockOperatorSupportSessions(tx, input.operatorId);
    await assertTenantCanSupportSession(tx, input.organizationId);
    await assertNoActiveSupportSession(tx, input.operatorId, now);
    await insertSupportSession(tx, input, session);
    await auditSupportSessionStarted(tx, input, session);

    const tenantBannerToken = signImpersonationTicket(secret, {
      ticketId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      exp: Math.floor(timing.expiresAt.getTime() / 1000),
    });
    return { ticketId, expiresAt: timing.expiresAt.toISOString(), tenantBannerToken };
  });
}

/**
 * Ends a session once. A missing (or out-of-scope) ticket is 404; a ticket that
 * already ended is 409. The update and audit insert share a transaction.
 */
export async function endImpersonation(
  prisma: PrismaClient,
  input: EndImpersonationInput
): Promise<EndImpersonationResult> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.impersonationSession.findFirst({
      where: { ticketId: input.ticketId, ...scopeFilter(input.scope) },
      select: {
        id: true,
        endedAt: true,
        organizationId: true,
      },
    });

    if (session === null) {
      throw new NotFoundError("Support session not found.", {
        code: PLATFORM_ERROR_CODE.SUPPORT_SESSION_NOT_FOUND,
      });
    }
    if (session.endedAt !== null) {
      throw new ConflictError("This support session has already ended.", {
        code: PLATFORM_ERROR_CODE.SUPPORT_SESSION_ALREADY_ENDED,
      });
    }

    const endedAt = new Date();
    const updated = await tx.impersonationSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt, endedBy: input.endedBy },
    });
    if (updated.count === 0) {
      throw new ConflictError("This support session has already ended.", {
        code: PLATFORM_ERROR_CODE.SUPPORT_SESSION_ALREADY_ENDED,
      });
    }

    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.actorOperatorId,
      action: PLATFORM_AUDIT_ACTIONS.IMPERSONATION_ENDED,
      entityType: IMPERSONATION_ENTITY_TYPE,
      entityId: input.ticketId,
      organizationId: session.organizationId,
      before: { endedAt: null },
      after: { endedAt: endedAt.toISOString(), endedBy: input.endedBy },
      requestId: input.requestId,
    });

    return { endedAt: endedAt.toISOString(), endedBy: input.endedBy };
  });
}

export async function listActiveForOperator(
  prisma: PrismaClient,
  operatorId: string
): Promise<OperatorSupportSession[]> {
  const now = new Date();
  const rows = await prisma.impersonationSession.findMany({
    where: { operatorId, ...activeWithin(now) },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: MAXIMUM_ACTIVE_SESSIONS,
    select: {
      ticketId: true,
      organizationId: true,
      reason: true,
      ticketRef: true,
      startedAt: true,
      expiresAt: true,
    },
  });
  return rows.map((row) => ({
    ticketId: row.ticketId,
    organizationId: row.organizationId,
    reason: row.reason,
    ticketRef: row.ticketRef,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));
}

/** The tenant banner shows the most recent active session for the workspace. */
export async function findActiveForOrganization(
  prisma: PrismaClient,
  organizationId: string
): Promise<ActiveSupportSession | null> {
  const now = new Date();
  const row = await prisma.impersonationSession.findFirst({
    where: { organizationId, ...activeWithin(now) },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: {
      ticketId: true,
      reason: true,
      ticketRef: true,
      startedAt: true,
      expiresAt: true,
      operator: { select: { displayName: true } },
    },
  });
  if (row === null) {
    return null;
  }
  return {
    ticketId: row.ticketId,
    operatorDisplayName: row.operator.displayName,
    reason: row.reason,
    ticketRef: row.ticketRef,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

interface SupportSessionCursor {
  /** The database timestamp with microsecond precision, in UTC ISO form. */
  readonly startedAt: string;
  readonly id: string;
}

const supportSessionCursorSchema = z
  .object({
    startedAt: z
      .string()
      .min(1)
      .refine((value) => !Number.isNaN(new Date(value).getTime())),
    id: z.string().min(1).max(64),
  })
  .strict();

function encodeSupportSessionCursor(row: SupportSessionCursor): string {
  return Buffer.from(JSON.stringify(row), "utf8").toString("base64url");
}

function decodeSupportSessionCursor(raw: string): SupportSessionCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch (error) {
    throw new ValidationError("Invalid pagination cursor.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      cause: error,
    });
  }
  const result = supportSessionCursorSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError("Invalid pagination cursor.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      cause: result.error,
    });
  }
  return result.data;
}

function historyCursorClause(cursor: SupportSessionCursor | undefined): Prisma.Sql {
  if (cursor === undefined) {
    return Prisma.sql`TRUE`;
  }
  return Prisma.sql`(
    "s"."startedAt" < ${cursor.startedAt}::timestamptz
    OR ("s"."startedAt" = ${cursor.startedAt}::timestamptz AND "s"."id" < ${cursor.id})
  )`;
}

function toHistoryItem(row: HistoryRow): SupportSessionHistoryItem {
  return {
    ticketId: row.ticketId,
    operatorDisplayName: row.operatorDisplayName,
    reason: row.reason,
    ticketRef: row.ticketRef,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endedBy: row.endedBy,
  };
}

/**
 * Tenant-visible history, scoped by organization and cursor-paginated with the
 * stable startedAt DESC, id DESC order (FR-049, CT-5). This is a deliberate,
 * org-scoped curated read through the platform identity because app_tenant has
 * no grant on the platform schema; the follow-up is a SECURITY DEFINER
 * function owned by the platform role.
 */
export async function listHistoryForOrganization(
  prisma: PrismaClient,
  input: SupportSessionHistoryInput
): Promise<SupportSessionHistoryPage> {
  const limit = Math.min(
    Math.max(input.limit, 1),
    MAXIMUM_SUPPORT_SESSION_HISTORY_LIMIT
  );
  const cursor =
    input.cursor === undefined
      ? undefined
      : decodeSupportSessionCursor(input.cursor);

  const rows = await prisma.$queryRaw<HistoryRow[]>(Prisma.sql`
    SELECT
      "s"."id",
      "s"."ticketId",
      "o"."displayName" AS "operatorDisplayName",
      "s"."reason",
      "s"."ticketRef",
      "s"."startedAt",
      to_char(
        "s"."startedAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "startedAtCursor",
      "s"."expiresAt",
      "s"."endedAt",
      "s"."endedBy"
    FROM platform."impersonation_sessions" AS "s"
    JOIN platform."operators" AS "o" ON "o"."id" = "s"."operatorId"
    WHERE "s"."organizationId" = ${input.organizationId}
      AND ${historyCursorClause(cursor)}
    ORDER BY "s"."startedAt" DESC, "s"."id" DESC
    LIMIT ${limit + 1}
  `);

  const items = rows.slice(0, limit).map(toHistoryItem);
  const last = rows[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last !== undefined
        ? encodeSupportSessionCursor({
            startedAt: last.startedAtCursor,
            id: last.id,
          })
        : null,
  };
}
