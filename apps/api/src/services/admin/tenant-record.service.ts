import type { OrgStatus, PrismaClient } from "@suite/db";
import { NotFoundError } from "@suite/core/errors";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { readTenantOverview } from "./tenant-view.service.js";

export interface TenantQuota {
  readonly resourceKey: string;
  readonly limitValue: string;
  readonly isEnforced: boolean;
  readonly updatedAt: string;
}

export interface TenantLifecycleEntry {
  readonly id: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly reason: string;
  readonly actorOperatorId: string;
  readonly occurredAt: string;
}

export interface TenantAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorOperatorId: string | null;
  readonly occurredAt: string;
}

export interface TenantRecord {
  readonly profile: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly status: OrgStatus;
    readonly createdAt: string;
  };
  readonly counts: { readonly branches: number; readonly members: number };
  readonly apps: string[];
  readonly quotas: TenantQuota[];
  readonly lifecycle: TenantLifecycleEntry[];
  readonly lifecycleHasMore: boolean;
  readonly recentAudit: TenantAuditEntry[];
}

const AUDIT_PAGE_SIZE = 20;
const LIFECYCLE_PAGE_SIZE = 20;

export async function getTenantRecord(
  prisma: PrismaClient,
  organizationId: string
): Promise<TenantRecord> {
  const overview = await readTenantOverview(prisma, organizationId);
  if (overview === null) {
    throw new NotFoundError("Tenant not found.", {
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    });
  }

  const [quotas, lifecycle, audit] = await Promise.all([
    prisma.quota.findMany({
      where: { organizationId },
      orderBy: { resourceKey: "asc" },
    }),
    prisma.lifecycleEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      take: LIFECYCLE_PAGE_SIZE + 1,
    }),
    prisma.auditEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorOperatorId: true,
        occurredAt: true,
      },
    }),
  ]);

  return {
    profile: {
      id: overview.id,
      name: overview.name,
      slug: overview.slug,
      status: overview.status as OrgStatus,
      createdAt: overview.createdAt.toISOString(),
    },
    counts: {
      branches: overview.branchCount,
      members: overview.memberCount,
    },
    apps: overview.installedAppIds,
    quotas: quotas.map((quota) => ({
      resourceKey: quota.resourceKey,
      limitValue: quota.limitValue.toString(),
      isEnforced: quota.isEnforced,
      updatedAt: quota.updatedAt.toISOString(),
    })),
    lifecycleHasMore: lifecycle.length > LIFECYCLE_PAGE_SIZE,
    lifecycle: lifecycle.slice(0, LIFECYCLE_PAGE_SIZE).map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
      actorOperatorId: event.actorOperatorId,
      occurredAt: event.occurredAt.toISOString(),
    })),
    recentAudit: audit.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorOperatorId: entry.actorOperatorId,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  };
}