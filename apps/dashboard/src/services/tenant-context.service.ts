import { prisma } from "@suite/db";
import { PERMISSIONS } from "@suite/core";
import { extractEffectivePermissions, type SessionPayload } from "@suite/auth";
import type { TenantContext } from "@/components/layout/types";

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
      select: { name: true },
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

  let userPermissions: readonly string[] = session.permissions ?? [];

  if (
    userPermissions.length === 0 ||
    (!userPermissions.includes(PERMISSIONS.CORE.ORGANIZATION_READ) &&
      !userPermissions.includes(PERMISSIONS.WILDCARD))
  ) {
    const dbBranchRoles = await prisma.userBranchRole.findMany({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const dbPermissions = extractEffectivePermissions(dbBranchRoles, {
      branchId: session.activeBranchId,
    });

    if (dbPermissions.length > 0) {
      userPermissions = dbPermissions;
    }
  }

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

  const installedApps: DashboardInstalledAppNav[] = dbRecords.map((record) => {
    const settings = (record.settings as Record<string, unknown>) || {};
    return {
      id: record.appId,
      name: (settings.name as string) || (settings.title as string) || record.appId,
      href: (settings.href as string) || `/${record.appId}`,
      icon: (settings.iconName as string) || record.appId,
      badge: (settings.code as string) || undefined,
      description: (settings.description as string) || "",
      permission:
        (settings.permission as string) || PERMISSIONS.CORE.ORGANIZATION_READ,
    };
  });

  return { tenant, installedApps };
}
