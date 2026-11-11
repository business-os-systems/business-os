import { prisma, type InstalledApp } from "@suite/db";
import {
  TENANT_STATUS,
  isBlockingTenantStatus,
  type BlockingTenantStatus,
} from "@suite/core";
import { listUserTenants, type SessionPayload } from "@suite/auth";
import { resolveEffectivePermissions } from "./effective-permissions.service";
import type { TenantContext } from "@/components/layout/types";
import { workspacePath } from "@/lib/workspace-paths";




export interface DashboardInstalledAppNav {
  id: string;
  name: string;
  href: string;
  icon: string;
  badge?: string;
  description: string;
  permission: string;
}

export interface DashboardLayoutData {
  tenant: TenantContext;
  installedApps: DashboardInstalledAppNav[];
  /** The workspace state that must deny access, if any. */
  blockedStatus: BlockingTenantStatus | null;
}

/** A missing organisation row is treated as archived: the workspace is gone. */
function resolveBlockedStatus(
  status: string | undefined
): BlockingTenantStatus | null {
  const effective = status ?? TENANT_STATUS.ARCHIVED;
  return isBlockingTenantStatus(effective) ? effective : null;
}

/**
 * True when the user can still reach another workspace after this one was
 * archived. The dashboard shell redirects such members to the chooser.
 */
export async function hasAccessibleWorkspace(userId: string): Promise<boolean> {
  const tenants = await listUserTenants(userId, prisma);
  return tenants.length > 0;
}

/**
 * Service to resolve full tenant context and installed app navigation for the dashboard shell.
 * Decouples database queries from React Server Components per Clean Code architecture.
 */
export async function getDashboardTenantContext(
  session: SessionPayload & {
    organizationId: string;
    organizationName: string;
    userName: string;
    email: string;
  }
): Promise<DashboardLayoutData> {
  const [dbUser, dbOrg, dbRecords] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { emailVerified: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true, status: true },
    }),
    prisma.installedApp.findMany({
      where: {
        organizationId: session.organizationId,
        isEnabled: true,
      },
      orderBy: {
        installedAt: "asc",
      },
    }),
  ]);

  const userEmailVerified = dbUser ? dbUser.emailVerified : true;
  const effectiveOrgName = dbOrg?.name ?? session.organizationName;
  const blockedStatus = resolveBlockedStatus(dbOrg?.status);

  const userPermissions = await resolveEffectivePermissions(session);

  const tenant: TenantContext = {


    organizationId: session.organizationId,
    organizationName: effectiveOrgName,
    userName: session.userName,
    userEmail: session.email,
    userEmailVerified,
    userRole: session.role,
    userPermissions,
    activeBranchId: session.activeBranchId,
    activeBranchName: session.activeBranchName,
  };

  const installedApps: DashboardInstalledAppNav[] = dbRecords.map((record: InstalledApp) => {
    const settings = (record.settings as Record<string, unknown>) || {};
    const title =
      (settings.title as string) ||
      (settings.name as string) ||
      record.appId;
    return {
      id: record.appId,
      name: title,
      href: workspacePath((settings.href as string) || `/${record.appId}`),
      icon: (settings.iconName as string) || record.appId,
      badge: (settings.code as string) || undefined,
      description: (settings.description as string) || "",
      permission: (settings.permission as string) || `${record.appId}:read`,
    };
  });


  return { tenant, installedApps, blockedStatus };
}

