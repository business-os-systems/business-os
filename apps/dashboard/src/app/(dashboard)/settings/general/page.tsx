import React from "react";
import { Alert } from "@suite/ui";
import { requireAuth } from "@/lib/auth-guard";
import { getOrganizationSettings } from "@/services/organization-settings.service";
import {
  listOrganizationAddresses,
  type AddressListItemDto,
} from "@/services/addresses.service";
import { GeneralSettingsClient } from "./general-client";

export default async function GeneralSettingsPage() {
  const session = await requireAuth();
  const [organization, addresses] = await Promise.all([
    getOrganizationSettings(session.organizationId),
    listOrganizationAddresses(session.organizationId),
  ]);

  if (!organization) {
    return (
      <div className="max-w-4xl py-6">
        <Alert variant="error" title="Organization Not Found">
          Active organization could not be found. Please contact support.
        </Alert>
      </div>
    );
  }

  const addressOptions = addresses.map((addr: AddressListItemDto) => ({
    label: `${addr.formattedAddress} (${addr.postalCode})`,
    value: addr.id,
  }));

  return (
    <div className="space-y-6 max-w-4xl">
      <GeneralSettingsClient
        initialData={{
          name: organization.name,
          customDomain: organization.customDomain ?? "",
          currency: organization.currency,
          country: organization.country,
          defaultLocale: organization.defaultLocale,
          jurisdiction: organization.jurisdiction,
          registeredAddressId: organization.registeredAddressId ?? "",
        }}
        organizationId={organization.id}
        slug={organization.slug}
        userPermissions={session.permissions ?? []}
        addressOptions={addressOptions}
      />
    </div>
  );
}
