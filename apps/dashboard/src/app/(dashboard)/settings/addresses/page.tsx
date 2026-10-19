import React from "react";
import { requireAuth } from "@/lib/auth-guard";
import { listOrganizationAddresses } from "@/services/addresses.service";
import { AddressesClient } from "./addresses-client";

export default async function AddressesSettingsPage() {
  const session = await requireAuth();

  const addresses = await listOrganizationAddresses(session.organizationId);

  return (
    <AddressesClient
      initialAddresses={addresses}
      organizationId={session.organizationId}
      userPermissions={session.permissions}
    />
  );
}
