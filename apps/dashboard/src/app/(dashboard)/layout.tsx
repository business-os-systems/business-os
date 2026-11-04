import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@suite/db";
import { listUserTenants } from "@suite/auth";
import { TENANT_STATUS } from "@suite/core";
import { Toaster } from "@suite/ui";
import { requireAuth } from "@/lib/auth-guard";
import { getDashboardTenantContext } from "@/services/tenant-context.service";
import { getSupportContactEmail } from "@/lib/env";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { SuspensionNotice } from "../../components/layout/suspension-notice";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const { tenant, installedApps, blockedStatus } =
    await getDashboardTenantContext(session);

  // A blocked workspace never renders the shell (FR-017, FR-022). An archived
  // one sends a member who still holds another workspace to select it first.
  if (blockedStatus === TENANT_STATUS.ARCHIVED) {
    const activeTenants = await listUserTenants(session.userId, prisma);
    if (activeTenants.length > 0) {
      redirect("/choose-tenant");
    }
  }

  if (blockedStatus !== null) {
    return (
      <SuspensionNotice
        tenantName={tenant.organizationName}
        status={blockedStatus}
        supportEmail={getSupportContactEmail()}
      />
    );
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
