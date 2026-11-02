import {
  Prisma,
  type AuditEvent,
  type PrismaClient,
} from "@suite/db";
import { PLATFORM_AUDIT_PENDING_HASH } from "./audit-actions.js";

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

/**
 * The audit writer only needs the `auditEvent` delegate so it can also run
 * inside a transaction, where the trigger's advisory lock is held for the whole
 * transaction and several rows chain together.
 */
export type PlatformAuditWriterClient = Pick<PrismaClient, "auditEvent">;

/**
 * Append-only insert. The database trigger computes prevHash and recordHash;
 * app_platform has no UPDATE grant on platform.audit_events.
 */
export async function appendPlatformAuditEvent(
  prisma: PlatformAuditWriterClient,
  input: PlatformAuditEventInput
): Promise<AuditEvent> {
  return prisma.auditEvent.create({
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
      recordHash: PLATFORM_AUDIT_PENDING_HASH,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}
