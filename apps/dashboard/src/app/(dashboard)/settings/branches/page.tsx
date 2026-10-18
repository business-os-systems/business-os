import React from "react";
import { prisma } from "@suite/db";
import { requireAuth } from "@/lib/auth-guard";
import { listOrganizationBranches } from "@/services/branches.service";
import { BranchesClient } from "./branches-client";

export default async function BranchesSettingsPage() {
  const session = await requireAuth();

  const [branches, org] = await Promise.all([
    listOrganizationBranches(session.organizationId),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: {
        currency: true,
        defaultLocale: true,
      },
    }),
  ]);

  return (
    <BranchesClient
      initialBranches={branches}
      organizationId={session.organizationId}
      activeBranchId={session.activeBranchId}
      userPermissions={session.permissions}
      organizationDefaults={{
        currency: org?.currency ?? "INR",
        locale: org?.defaultLocale ?? "en-IN",
      }}
    />
  );
}

