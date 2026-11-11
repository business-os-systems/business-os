import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@suite/db";
import {
  MEDIA_AUDIT_ACTOR_ROLE,
  type MediaAuditAction,
} from "./constants.js";

export type MediaAuditClient = Pick<PrismaClient, "$executeRaw" | "auditLog">;

export interface MediaAuditInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly action: MediaAuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: Prisma.InputJsonValue | null;
  readonly after: Prisma.InputJsonValue | null;
}

function jsonValue(
  value: Prisma.InputJsonValue | null
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value ?? Prisma.JsonNull;
}

function recordHash(input: {
  readonly previousHash: string | null;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly action: MediaAuditAction;
  readonly entityId: string;
  readonly timestamp: Date;
}): string {
  return createHash("sha256")
    .update(
      `${input.previousHash ?? "GENESIS"}:${input.organizationId}:${input.actorUserId}:${input.action}:${input.entityId}:${input.timestamp.toISOString()}`
    )
    .digest("hex");
}

/**
 * Appends a tenant audit row in the mutation's transaction (XV.4). The
 * per-tenant advisory lock serialises chain reads so two concurrent media
 * writes cannot both link to the same predecessor. app_tenant holds INSERT and
 * SELECT, never UPDATE or DELETE, on public.audit_logs.
 */
export async function appendMediaAuditEvent(
  tx: MediaAuditClient,
  input: MediaAuditInput
): Promise<void> {
  const timestamp = new Date();
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"media-audit:" + input.organizationId}, 0))`
  );
  const previous = await tx.auditLog.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { timestamp: "desc" },
    select: { recordHash: true },
  });
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      appId: "media",
      actorUserId: input.actorUserId,
      actorRole: MEDIA_AUDIT_ACTOR_ROLE,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      prevHash: previous?.recordHash ?? null,
      recordHash: recordHash({
        previousHash: previous?.recordHash ?? null,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityId: input.entityId,
        timestamp,
      }),
      timestamp,
      newData: jsonValue(input.after),
      oldData: jsonValue(input.before),
    },
  });
}
