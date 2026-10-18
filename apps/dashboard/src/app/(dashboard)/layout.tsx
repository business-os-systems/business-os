import React from "react";
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
  const { tenant, installedApps } = await getDashboardTenantContext(session);

  return (
    <>
      <Toaster />
      <DashboardShell tenant={tenant} initialInstalledApps={installedApps}>
        {children}
      </DashboardShell>
    </>
  );
}
