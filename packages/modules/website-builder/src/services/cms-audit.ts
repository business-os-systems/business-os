import type { Prisma } from "@suite/db";
import type { CmsAuditAction, CmsAuditEntityType } from "../audit/actions.js";

export interface CmsAuditInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly action: CmsAuditAction;
  readonly entityType: CmsAuditEntityType;
  readonly entityId: string;
  readonly actorUserId: string;
  readonly changes: Prisma.InputJsonValue;
}

/**
 * Writes the CMS audit row inside the caller's transaction, so a mutation can
 * never commit without its audit trail (Platform invariant 4, CT-1). The actor
 * is the verified session user, never a request-supplied value.
 */
export async function writeCmsAudit(
  tx: Prisma.TransactionClient,
  input: CmsAuditInput
): Promise<void> {
  await tx.cmsAuditTrail.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId,
      changesJson: input.changes,
    },
  });
}
