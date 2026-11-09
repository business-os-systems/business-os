import React from "react";
import { prisma } from "@suite/db";
import { requireAuth } from "@/lib/auth-guard";
import { listOrganizationBranches } from "@/services/branches.service";
import { listOrganizationAddresses, type AddressListItemDto } from "@/services/addresses.service";
import { readBranchTypeOptions } from "@/lib/reference-client";
import { BranchesClient } from "./branches-client";

export default async function BranchesSettingsPage() {
  const session = await requireAuth();

  const [branches, org, addresses, branchTypes] = await Promise.all([
    listOrganizationBranches(session.organizationId),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: {
        currency: true,
        defaultLocale: true,
      },
    }),
    listOrganizationAddresses(session.organizationId),
    readBranchTypeOptions(),
  ]);

  const addressOptions = addresses.map((a: AddressListItemDto) => ({
    label: `${a.formattedAddress} (${a.postalCode})`,
    value: a.id,
  }));

  return (
    <BranchesClient
      initialBranches={branches}
      organizationId={session.organizationId}
      activeBranchId={session.activeBranchId}
      userPermissions={session.permissions}
      addressOptions={addressOptions}
      branchTypes={branchTypes}
      organizationDefaults={{
        currency: org?.currency ?? "INR",
        locale: org?.defaultLocale ?? "en-IN",
      }}
    />
  );
}

