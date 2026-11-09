import { prisma, type OrgStatus, type Prisma } from "@suite/db";

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

export interface OrganizationDetailDto extends OrganizationSettingsDto {
  taxProfile: unknown;
}

export interface OrganizationBranchDefaultsDto {
  readonly currency: string;
  readonly defaultLocale: string;
}

export interface UpdateOrganizationInput {
  readonly name?: string;
  readonly customDomain?: string | null;
  readonly currency?: string;
  readonly country?: string;
  readonly defaultLocale?: string;
  readonly jurisdiction?: string;
  readonly status?: OrgStatus;
  readonly registeredAddressId?: string | null;
}

export interface OrganizationUpdateSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
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

export async function getOrganizationDetail(
  organizationId: string
): Promise<OrganizationDetailDto | null> {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      registeredAddress: true,
      taxProfile: true,
    },
  });
}

export async function getOrganizationBranchDefaults(
  organizationId: string
): Promise<OrganizationBranchDefaultsDto | null> {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: { currency: true, defaultLocale: true },
  });
}

export async function getOrganizationStatus(
  organizationId: string
): Promise<{ readonly status: string } | null> {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
}

export async function isCustomDomainClaimed(
  customDomain: string,
  currentOrganizationId: string
): Promise<boolean> {
  const existing = await prisma.organization.findFirst({
    where: { customDomain, id: { not: currentOrganizationId } },
    select: { id: true },
  });
  return existing !== null;
}

function normalizeNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  return value;
}

function buildOrganizationUpdateData(
  input: UpdateOrganizationInput
): Prisma.OrganizationUncheckedUpdateInput {
  const customDomain = normalizeNullableText(input.customDomain);
  const registeredAddressId = normalizeNullableText(input.registeredAddressId);

  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(customDomain !== undefined ? { customDomain } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.country !== undefined ? { country: input.country } : {}),
    ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale } : {}),
    ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(registeredAddressId !== undefined ? { registeredAddressId } : {}),
  };
}

export async function updateOrganizationRecord(
  organizationId: string,
  input: UpdateOrganizationInput
): Promise<OrganizationDetailDto> {
  return prisma.organization.update({
    where: { id: organizationId },
    data: buildOrganizationUpdateData(input),
    include: {
      registeredAddress: true,
      taxProfile: true,
    },
  });
}
