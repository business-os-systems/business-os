import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@suite/db";
import { extractEffectivePermissions, type SessionPayload } from "@suite/auth";
import { PERMISSIONS } from "@suite/core";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { SESSION_COOKIE_NAME, decodeSessionPayload } from "@/lib/auth-constants";
import type { TenantContext } from "../../components/layout/types";
import type { InstalledAppNavInput } from "../../components/layout/navigation.config";

interface AuthenticatedSessionContext extends SessionPayload {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly userName: string;
  readonly email: string;
}

function isAuthenticatedSession(
  session: SessionPayload | null
): session is AuthenticatedSessionContext {
  return Boolean(
    session?.userId &&
    session?.organizationId &&
    session?.organizationName &&
    session?.userName &&
    session?.email
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const rawSession = sessionCookie ? decodeSessionPayload(sessionCookie) : null;

  if (!isAuthenticatedSession(rawSession)) {
    redirect("/login");
  }

  const session = rawSession;

  let userEmailVerified = true;
  const [dbUser, dbOrg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { emailVerified: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true },
    }),
  ]);

  if (dbUser) {
    userEmailVerified = dbUser.emailVerified;
  }

  const effectiveOrgName = dbOrg?.name ?? session.organizationName;

  // Resolve effective capabilities dynamically from DB relations (Zero Role Name Checking)
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

  const dbRecords = await prisma.installedApp.findMany({
    where: {
      organizationId: session.organizationId,
      isEnabled: true,
    },
    orderBy: {
      installedAt: "asc",
    },
  });

  const initialInstalledApps: InstalledAppNavInput[] = dbRecords.map((record) => {
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

  return (
    <DashboardShell tenant={tenant} initialInstalledApps={initialInstalledApps}>
      {children}
    </DashboardShell>
  );
}
