import { prisma } from "@suite/db";

export interface OrganizationAddressSummary {
  id: string;
  streetAddress: string | null;
  city: string | null;
  state: string;
  postalCode: string;
}

export interface OrganizationSettingsDto {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  currency: string;
  country: string;
  defaultLocale: string;
  jurisdiction: string;
  status: string;
  registeredAddressId: string | null;
  registeredAddress: OrganizationAddressSummary | null;
}

/**
 * Service to fetch organization settings data.
 * Decouples database queries from General Settings page components.
 */
export async function getOrganizationSettings(
  organizationId: string
): Promise<OrganizationSettingsDto | null> {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      currency: true,
      country: true,
      defaultLocale: true,
      jurisdiction: true,
      status: true,
      registeredAddressId: true,
      registeredAddress: {
        select: {
          id: true,
          streetAddress: true,
          city: true,
          state: true,
          postalCode: true,
        },
      },
    },
  });
}
