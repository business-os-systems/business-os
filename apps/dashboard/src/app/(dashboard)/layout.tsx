import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@suite/db";
import { listUserTenants } from "@suite/auth";
import { Toaster } from "@suite/ui";
import { requireAuth } from "@/lib/auth-guard";
import { getDashboardTenantContext } from "@/services/tenant-context.service";
import { DashboardShell } from "../../components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const { tenant, installedApps, isArchived } =
    await getDashboardTenantContext(session);

  if (isArchived) {
    const activeTenants = await listUserTenants(session.userId, prisma);
    if (activeTenants.length > 0) {
      redirect("/choose-tenant");
    } else {
      redirect("/login?notice=archived");
    }
  }

  return (
    <>
      <Toaster />
      <DashboardShell tenant={tenant} initialInstalledApps={installedApps}>
        {children}
      </DashboardShell>
    </>
  );
}
