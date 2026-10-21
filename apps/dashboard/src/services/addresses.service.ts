import { prisma } from "@suite/db";
import { Prisma } from "@suite/db";

export type AddressType = "URBAN" | "RURAL";

export interface AddressBranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface AddressOrgSummary {
  id: string;
  name: string;
}

export interface AddressListItemDto {
  id: string;
  organizationId: string | null;
  addressType: AddressType;
  streetAddress: string | null;
  landmark: string | null;
  city: string | null;
  village: string | null;
  postOffice: string | null;
  district: string | null;
  state: string;
  postalCode: string;
  country: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  mapUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  isOrgRegisteredAddress: boolean;
  linkedBranches: AddressBranchSummary[];
  linkedBranchesCount: number;
  isDeletable: boolean;
  inUseReason: string | null;
}

export interface CreateAddressInput {
  addressType?: AddressType;
  streetAddress?: string | null;
  landmark?: string | null;
  city?: string | null;
  village?: string | null;
  postOffice?: string | null;
  district?: string | null;
  state: string;
  postalCode: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  mapUrl?: string | null;
}

export interface UpdateAddressInput {
  addressType?: AddressType;
  streetAddress?: string | null;
  landmark?: string | null;
  city?: string | null;
  village?: string | null;
  postOffice?: string | null;
  district?: string | null;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  mapUrl?: string | null;
}

export type DeleteAddressResult =
  | { success: true }
  | { success: false; code: "NOT_FOUND"; message: string }
  | { success: false; code: "CONFLICT"; message: string; inUseReason: string };

/**
 * Format address into a readable summary string for UI display and table rows.
 */
export function formatAddress(address: {
  addressType?: string | null;
  streetAddress?: string | null;
  village?: string | null;
  postOffice?: string | null;
  district?: string | null;
  city?: string | null;
  state: string;
  postalCode: string;
  country: string;
}): string {
  if (address.addressType === "RURAL") {
    const parts: string[] = [];
    if (address.village) parts.push(address.village);
    if (address.postOffice) parts.push(`PO: ${address.postOffice}`);
    if (address.district) parts.push(`Dist: ${address.district}`);
    parts.push(`${address.state} - ${address.postalCode}`);
    parts.push(address.country);
    return parts.join(", ");
  }

  const parts: string[] = [];
  if (address.streetAddress) parts.push(address.streetAddress);
  if (address.city) parts.push(address.city);
  parts.push(`${address.state} - ${address.postalCode}`);
  parts.push(address.country);
  return parts.join(", ");
}

function mapToAddressListItemDto(
  record: {
    id: string;
    organizationId: string | null;
    addressType: string;
    streetAddress: string | null;
    landmark: string | null;
    city: string | null;
    village: string | null;
    postOffice: string | null;
    district: string | null;
    state: string;
    postalCode: string;
    country: string;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    googlePlaceId: string | null;
    mapUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    branches: AddressBranchSummary[];
    organizations: AddressOrgSummary[];
  },
  organizationId: string
): AddressListItemDto {
  const isOrgRegistered = record.organizations.some((org) => org.id === organizationId);
  const branchCount = record.branches.length;
  const isDeletable = !isOrgRegistered && branchCount === 0;

  let inUseReason: string | null = null;
  if (isOrgRegistered && branchCount > 0) {
    inUseReason = `Linked as Legal HQ Address and used by ${branchCount} branch(es)`;
  } else if (isOrgRegistered) {
    inUseReason = "Linked as Organization Legal HQ Address";
  } else if (branchCount > 0) {
    const branchNames = record.branches.map((b) => `${b.name} (${b.code})`).join(", ");
    inUseReason = `Actively linked to branch(es): ${branchNames}`;
  }

  const addressType = (record.addressType === "RURAL" ? "RURAL" : "URBAN") as AddressType;

  return {
    id: record.id,
    organizationId: record.organizationId,
    addressType,
    streetAddress: record.streetAddress,
    landmark: record.landmark,
    city: record.city,
    village: record.village,
    postOffice: record.postOffice,
    district: record.district,
    state: record.state,
    postalCode: record.postalCode,
    country: record.country,
    formattedAddress: formatAddress({
      addressType,
      streetAddress: record.streetAddress,
      village: record.village,
      postOffice: record.postOffice,
      district: record.district,
      city: record.city,
      state: record.state,
      postalCode: record.postalCode,
      country: record.country,
    }),
    latitude: record.latitude ? Number(record.latitude) : null,
    longitude: record.longitude ? Number(record.longitude) : null,
    googlePlaceId: record.googlePlaceId,
    mapUrl: record.mapUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isOrgRegisteredAddress: isOrgRegistered,
    linkedBranches: record.branches,
    linkedBranchesCount: branchCount,
    isDeletable,
    inUseReason,
  };
}

/**
 * List all operational addresses for an organization.
 */
export async function listOrganizationAddresses(
  organizationId: string,
  search?: string
): Promise<AddressListItemDto[]> {
  const whereClause: Prisma.AddressWhereInput = {
    OR: [
      { organizationId },
      { branches: { some: { organizationId } } },
      { organizations: { some: { id: organizationId } } },
    ],
  };

  if (search && search.trim()) {
    const query = search.trim();
    whereClause.AND = [
      {
        OR: [
          { streetAddress: { contains: query, mode: "insensitive" } },
          { landmark: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
          { village: { contains: query, mode: "insensitive" } },
          { postOffice: { contains: query, mode: "insensitive" } },
          { district: { contains: query, mode: "insensitive" } },
          { state: { contains: query, mode: "insensitive" } },
          { postalCode: { contains: query, mode: "insensitive" } },
        ],
      },
    ];
  }

  const rawAddresses = await prisma.address.findMany({
    where: whereClause,
    include: {
      branches: {
        where: { organizationId },
        select: { id: true, name: true, code: true },
      },
      organizations: {
        where: { id: organizationId },
        select: { id: true, name: true },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

type RawAddressRecord = Parameters<typeof mapToAddressListItemDto>[0];

  return rawAddresses.map((addr: RawAddressRecord) => mapToAddressListItemDto(addr, organizationId));
}

/**
 * Get an address by ID ensuring tenant tenancy scoping.
 */
export async function getAddressById(
  organizationId: string,
  addressId: string
): Promise<AddressListItemDto | null> {
  const addr = await prisma.address.findFirst({
    where: {
      id: addressId,
      OR: [
        { organizationId },
        { branches: { some: { organizationId } } },
        { organizations: { some: { id: organizationId } } },
      ],
    },
    include: {
      branches: {
        where: { organizationId },
        select: { id: true, name: true, code: true },
      },
      organizations: {
        where: { id: organizationId },
        select: { id: true, name: true },
      },
    },
  });

  if (!addr) {
    return null;
  }

  return mapToAddressListItemDto(addr, organizationId);
}

/**
 * Create a new operational address scoped to the organization.
 */
export async function createAddressRecord(
  organizationId: string,
  input: CreateAddressInput
): Promise<AddressListItemDto> {
  const addressType = input.addressType === "RURAL" ? "RURAL" : "URBAN";

  const created = await prisma.address.create({
    data: {
      organizationId,
      addressType,
      streetAddress: input.streetAddress ? input.streetAddress.trim() : null,
      landmark: input.landmark?.trim() || null,
      city: input.city ? input.city.trim() : null,
      village: input.village ? input.village.trim() : null,
      postOffice: input.postOffice ? input.postOffice.trim() : null,
      district: input.district ? input.district.trim() : null,
      state: input.state.trim(),
      postalCode: input.postalCode.trim(),
      country: input.country?.trim() || "IN",
      latitude:
        input.latitude !== undefined && input.latitude !== null
          ? new Prisma.Decimal(input.latitude)
          : null,
      longitude:
        input.longitude !== undefined && input.longitude !== null
          ? new Prisma.Decimal(input.longitude)
          : null,
      googlePlaceId: input.googlePlaceId?.trim() || null,
      mapUrl: input.mapUrl?.trim() || null,
    },
    include: {
      branches: {
        where: { organizationId },
        select: { id: true, name: true, code: true },
      },
      organizations: {
        where: { id: organizationId },
        select: { id: true, name: true },
      },
    },
  });

  return mapToAddressListItemDto(created, organizationId);
}

/**
 * Update an existing operational address.
 */
export async function updateAddressRecord(
  organizationId: string,
  addressId: string,
  input: UpdateAddressInput
): Promise<AddressListItemDto | null> {
  const existing = await getAddressById(organizationId, addressId);
  if (!existing) {
    return null;
  }

  const dataToUpdate: Prisma.AddressUpdateInput = {};

  if (input.addressType !== undefined) {
    dataToUpdate.addressType = input.addressType === "RURAL" ? "RURAL" : "URBAN";
  }
  if (input.streetAddress !== undefined) {
    dataToUpdate.streetAddress = input.streetAddress ? input.streetAddress.trim() : null;
  }
  if (input.landmark !== undefined) {
    dataToUpdate.landmark = input.landmark?.trim() || null;
  }
  if (input.city !== undefined) {
    dataToUpdate.city = input.city ? input.city.trim() : null;
  }
  if (input.village !== undefined) {
    dataToUpdate.village = input.village ? input.village.trim() : null;
  }
  if (input.postOffice !== undefined) {
    dataToUpdate.postOffice = input.postOffice ? input.postOffice.trim() : null;
  }
  if (input.district !== undefined) {
    dataToUpdate.district = input.district ? input.district.trim() : null;
  }
  if (input.state !== undefined) {
    dataToUpdate.state = input.state.trim();
  }
  if (input.postalCode !== undefined) {
    dataToUpdate.postalCode = input.postalCode.trim();
  }
  if (input.country !== undefined) {
    dataToUpdate.country = input.country.trim();
  }
  if (input.latitude !== undefined) {
    dataToUpdate.latitude =
      input.latitude !== null ? new Prisma.Decimal(input.latitude) : null;
  }
  if (input.longitude !== undefined) {
    dataToUpdate.longitude =
      input.longitude !== null ? new Prisma.Decimal(input.longitude) : null;
  }
  if (input.googlePlaceId !== undefined) {
    dataToUpdate.googlePlaceId = input.googlePlaceId?.trim() || null;
  }
  if (input.mapUrl !== undefined) {
    dataToUpdate.mapUrl = input.mapUrl?.trim() || null;
  }

  // Backfill organizationId if it was previously null
  if (!existing.organizationId) {
    dataToUpdate.organization = { connect: { id: organizationId } };
  }

  const updated = await prisma.address.update({
    where: { id: addressId },
    data: dataToUpdate,
    include: {
      branches: {
        where: { organizationId },
        select: { id: true, name: true, code: true },
      },
      organizations: {
        where: { id: organizationId },
        select: { id: true, name: true },
      },
    },
  });

  return mapToAddressListItemDto(updated, organizationId);
}

/**
 * Delete an address with conflict prevention if actively linked.
 */
export async function deleteAddressRecord(
  organizationId: string,
  addressId: string
): Promise<DeleteAddressResult> {
  const existing = await getAddressById(organizationId, addressId);
  if (!existing) {
    return {
      success: false,
      code: "NOT_FOUND",
      message: `Address '${addressId}' not found in your organization.`,
    };
  }

  if (!existing.isDeletable) {
    return {
      success: false,
      code: "CONFLICT",
      message:
        "Cannot delete this address because it is actively linked to an organization profile or branch operational site.",
      inUseReason: existing.inUseReason || "Actively referenced by organization entities.",
    };
  }

  await prisma.address.delete({
    where: { id: addressId },
  });

  return { success: true };
}
