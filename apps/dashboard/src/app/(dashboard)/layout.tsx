import React from "react";
import { cookies } from "next/headers";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { SESSION_COOKIE_NAME, decodeSessionPayload } from "@/lib/auth-constants";
import type { TenantContext } from "../../components/layout/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? decodeSessionPayload(sessionCookie) : null;

  const tenant: TenantContext | undefined = session
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

  return <DashboardShell tenant={tenant}>{children}</DashboardShell>;
}
