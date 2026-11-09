import React from "react";
import { requireAuth } from "@/lib/auth-guard";
import { getOrganizationBranchDefaults } from "@/services/organization-settings.service";
import { listOrganizationBranches } from "@/services/branches.service";
import { listOrganizationAddresses, type AddressListItemDto } from "@/services/addresses.service";
import { readBranchTypeOptions } from "@/lib/reference-client";
import { BranchesClient } from "./branches-client";

export default async function BranchesSettingsPage() {
  const session = await requireAuth();

  const [branches, organization, addresses, branchTypes] = await Promise.all([
    listOrganizationBranches(session.organizationId),
    getOrganizationBranchDefaults(session.organizationId),
    listOrganizationAddresses(session.organizationId),
    readBranchTypeOptions(),
  ]);

  const addressOptions = addresses.map((address: AddressListItemDto) => ({
    label: `${address.formattedAddress} (${address.postalCode})`,
    value: address.id,
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
        currency: organization?.currency ?? "INR",
        locale: organization?.defaultLocale ?? "en-IN",
      }}
    />
  );
}
