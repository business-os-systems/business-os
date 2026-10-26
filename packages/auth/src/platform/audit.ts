import {
  Prisma,
  type AuditEvent,
  type PrismaClient,
} from "@suite/db";
import { sha256Hex } from "../crypto/hmac.js";

/**
 * Serialises the Platform audit chain. The advisory lock prevents two writers
 * from chaining onto the same previous record.
 */
export const PLATFORM_AUDIT_LOCK_ID = 724001;

export interface PlatformAuditEventInput {
  readonly actorOperatorId?: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly organizationId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reason?: string | null;
  readonly requestId: string;
  readonly occurredAt?: Date;
}

export interface ComputePlatformAuditHashInput {
  readonly prevHash: string | null;
  readonly actorOperatorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly organizationId: string | null;
  readonly beforeText: string;
  readonly afterText: string;
  readonly reason: string | null;
  readonly requestId: string;
  readonly occurredAt: Date;
}

function encodeField(value: string | null): string {
  const text = value ?? "";
  return `${new TextEncoder().encode(text).byteLength}:${text}`;
}

/**
 * Length-prefixed fields make the hash input unambiguous even when a field
 * contains the separator. The SQL functions in T016 must use the same format:
 * octet_length(value) || ':' || value, in this order.
 */
export async function computePlatformAuditHash(
  input: ComputePlatformAuditHashInput
): Promise<string> {
  const payload = [
    encodeField(input.prevHash ?? "GENESIS"),
    encodeField(input.actorOperatorId),
    encodeField(input.action),
    encodeField(input.entityType),
    encodeField(input.entityId),
    encodeField(input.organizationId),
    encodeField(input.beforeText),
    encodeField(input.afterText),
    encodeField(input.reason),
    encodeField(input.requestId),
    encodeField(input.occurredAt.toISOString()),
  ].join("");
  return sha256Hex(payload);
}

function toJsonInput(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

export async function appendPlatformAuditEvent(
  prisma: PrismaClient,
  input: PlatformAuditEventInput
): Promise<AuditEvent> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${PLATFORM_AUDIT_LOCK_ID})`
    );

    const previous = await tx.auditEvent.findFirst({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { recordHash: true },
    });

    const occurredAt = input.occurredAt ?? new Date();
    const created = await tx.auditEvent.create({
      data: {
        actorOperatorId: input.actorOperatorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        organizationId: input.organizationId ?? null,
        before: toJsonInput(input.before),
        after: toJsonInput(input.after),
        reason: input.reason ?? null,
        requestId: input.requestId,
        prevHash: previous?.recordHash ?? null,
        recordHash: "PENDING",
        occurredAt,
      },
    });

    const canonicalRows = await tx.$queryRaw<
      Array<{ beforeText: string | null; afterText: string | null }>
    >(Prisma.sql`
      SELECT "before"::text AS "beforeText", "after"::text AS "afterText"
      FROM "platform"."audit_events"
      WHERE "id" = ${created.id}
    `);
    const canonical = canonicalRows[0];
    if (canonical === undefined) {
      throw new Error("Platform audit row disappeared inside its transaction");
    }

    const recordHash = await computePlatformAuditHash({
      prevHash: created.prevHash,
      actorOperatorId: created.actorOperatorId,
      action: created.action,
      entityType: created.entityType,
      entityId: created.entityId,
      organizationId: created.organizationId,
      beforeText: canonical.beforeText ?? "",
      afterText: canonical.afterText ?? "",
      reason: created.reason,
      requestId: created.requestId,
      occurredAt: created.occurredAt,
    });

    return tx.auditEvent.update({
      where: { id: created.id },
      data: { recordHash },
    });
  });
}
