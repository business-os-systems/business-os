import React from "react";
import { redirect } from "next/navigation";
import { prisma } from "@suite/db";
import { listUserTenants } from "@suite/auth";
import { TENANT_STATUS } from "@suite/core";
import { Toaster } from "@suite/ui";
import { requireAuth } from "@/lib/auth-guard";
import { getDashboardTenantContext } from "@/services/tenant-context.service";
import { getSupportContactEmail } from "@/lib/env";
import {
  fetchActiveSupportSession,
  type SupportSessionView,
} from "@/lib/support-session-client";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { SuspensionNotice } from "../../components/layout/suspension-notice";
import { SupportSessionBanner } from "../../components/layout/support-session-banner";

/**
 * Reads the workspace's active support session for the persistent banner.
 *
 * Trade-off (documented in STATUS-237): a control-plane outage must never take
 * the tenant workspace down, so a failed read is logged with its RFC 7807 detail
 * and the shell renders without the banner. The try block stays around the one
 * call that can fail, and the caught value stays unknown until it is narrowed
 * for the log line.
 */
async function readActiveSupportSession(): Promise<SupportSessionView | null> {
  try {
    return await fetchActiveSupportSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Active support-session read failed:", message);
    return null;
  }
}

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

  const supportSession = await readActiveSupportSession();

  return (
    <>
      <Toaster />
      <DashboardShell tenant={tenant} initialInstalledApps={installedApps}>
        {supportSession === null ? null : (
          <SupportSessionBanner session={supportSession} />
        )}
        {children}
      </DashboardShell>
    </>
  );
}
