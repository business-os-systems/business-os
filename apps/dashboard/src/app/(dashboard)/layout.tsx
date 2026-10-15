import React from "react";
import { cookies } from "next/headers";
import { prisma } from "@suite/db";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { BASE_NAV_ITEMS } from "../../components/layout/types";
import { SESSION_COOKIE_NAME, decodeSessionPayload } from "@/lib/auth-constants";
import type { TenantContext, NavigationItem } from "../../components/layout/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? decodeSessionPayload(sessionCookie) : null;

  const tenant: TenantContext | undefined =
    session && session.organizationId && session.organizationName
      ? {
          organizationId: session.organizationId,
          organizationName: session.organizationName,
          userName: session.userName,
          userEmail: session.email,
          userRole: session.role,
          activeBranchId: session.activeBranchId,
          activeBranchName: session.activeBranchName,
        }
      : undefined;

  let initialNavItems: NavigationItem[] = BASE_NAV_ITEMS;

  if (session?.organizationId) {
    try {
      const dbRecords = await prisma.installedApp.findMany({
        where: {
          organizationId: session.organizationId,
          isEnabled: true,
        },
        orderBy: {
          installedAt: "asc",
        },
      });

      if (dbRecords.length > 0) {
        initialNavItems = [
          ...BASE_NAV_ITEMS,
          ...dbRecords.map((record) => {
            const settings = (record.settings as Record<string, unknown>) || {};
            return {
              id: record.appId,
              name: (settings.name as string) || (settings.title as string) || record.appId,
              href: (settings.href as string) || `/${record.appId}`,
              icon: (settings.iconName as string) || record.appId,
              badge: (settings.code as string) || undefined,
              description: (settings.description as string) || "",
            };
          }),
        ];
      }
    } catch {
      // In case of error, initialNavItems remains BASE_NAV_ITEMS
    }
  }

  return (
    <DashboardShell tenant={tenant} initialNavItems={initialNavItems}>
      {children}
    </DashboardShell>
  );
}
