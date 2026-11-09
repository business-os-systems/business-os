import { prisma } from "@suite/db";

export interface AuditLogQuery {
  readonly organizationId: string;
  readonly appId?: string;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly page: number;
  readonly limit: number;
}

/** The audit trail read is paginated with a hard cap enforced by the route. */
export async function queryAuditLogs(query: AuditLogQuery) {
  const skip = (query.page - 1) * query.limit;
  const where = {
    organizationId: query.organizationId,
    ...(query.appId === undefined ? {} : { appId: query.appId }),
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
    ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
  };

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { timestamp: "desc" },
    }),
  ]);

  return { items, total };
}
