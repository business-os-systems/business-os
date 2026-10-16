import { createHash } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import type { AuditEventType } from "@suite/core";

export interface SecurityAuditParams {
  prisma: PrismaClient;
  organizationId?: string | null;
  userId: string;
  action: AuditEventType;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Records a security audit log entry in PostgreSQL adhering to OWASP ASVS 4.0.3 Non-Repudiation.
 * Computes tamper-evident SHA-256 recordHash for every audit entry.
 */
export async function recordSecurityAuditLog({
  prisma,
  organizationId,
  userId,
  action,
  entityType = "User",
  entityId,
  ipAddress,
  userAgent,
  details,
  metadata,
}: SecurityAuditParams): Promise<void> {
  const targetOrgId = organizationId || "platform";
  const targetEntityId = entityId || userId;
  const timestamp = new Date();

  // SHA-256 Tamper-evident record hash
  const recordHash = createHash("sha256")
    .update(`${targetOrgId}:${userId}:${action}:${targetEntityId}:${timestamp.toISOString()}`)
    .digest("hex");

  const auditData = metadata || details;

  await prisma.auditLog.create({
    data: {
      organizationId: targetOrgId,
      appId: "auth",
      actorUserId: userId,
      actorRole: "USER",
      action,
      entityType,
      entityId: targetEntityId,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      timestamp,
      recordHash,
      newData: auditData ? (auditData as unknown as object) : undefined,
    },
  });
}
