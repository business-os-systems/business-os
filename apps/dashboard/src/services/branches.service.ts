import { prisma } from "@suite/db";
import type { Prisma } from "@suite/db";

export interface BranchAddressDto {
  id: string;
  streetAddress: string;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  mapUrl?: string | null;
}

export interface BranchListItemDto {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  type: string;
  capabilities: string[];
  status: string;
  timezone: string;
  nightAuditHour: number;
  currency: string;
  locale: string;
  dateFormat: string;
  timeFormat: string;
  taxIdentifier?: string | null;
  addressId?: string | null;
  parentBranchId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  address?: BranchAddressDto | null;
}

export interface CreateBranchInput {
  name: string;
  code: string;
  type: string;
  capabilities?: string[];
  timezone?: string;
  nightAuditHour?: number;
  currency?: string;
  locale?: string;
  dateFormat?: string;
  timeFormat?: string;
  taxIdentifier?: string | null;
  addressId?: string | null;
  parentBranchId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateBranchInput {
  name?: string;
  type?: string;
  capabilities?: string[];
  status?: string;
  timezone?: string;
  nightAuditHour?: number;
  currency?: string;
  locale?: string;
  dateFormat?: string;
  timeFormat?: string;
  taxIdentifier?: string | null;
  addressId?: string | null;
  parentBranchId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Service to manage operational branches for a tenant.
 * Decouples database queries from route handlers and RSCs per Clean Code architecture.
 */
export async function listOrganizationBranches(
  organizationId: string,
  options?: { status?: string }
): Promise<BranchListItemDto[]> {
  const whereClause: Record<string, unknown> = { organizationId };

  if (options?.status && options.status !== "ALL") {
    whereClause.status = options.status;
  }

  const branches = await prisma.branch.findMany({
    where: whereClause,
    include: {
      address: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return branches as BranchListItemDto[];
}

export async function getBranchById(
  organizationId: string,
  branchId: string
): Promise<BranchListItemDto | null> {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
    },
    include: {
      address: true,
    },
  });

  return branch as BranchListItemDto | null;
}

export async function checkBranchCodeConflict(
  organizationId: string,
  code: string,
  excludeBranchId?: string
): Promise<boolean> {
  const existing = await prisma.branch.findFirst({
    where: {
      organizationId,
      code,
      ...(excludeBranchId ? { id: { not: excludeBranchId } } : {}),
    },
    select: { id: true },
  });

  return existing !== null;
}

export async function createBranchRecord(
  organizationId: string,
  input: CreateBranchInput
): Promise<BranchListItemDto> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { currency: true, defaultLocale: true },
  });

  const currency = input.currency || org?.currency || "INR";
  const locale = input.locale || org?.defaultLocale || "en";

  const created = await prisma.branch.create({
    data: {
      organizationId,
      name: input.name,
      code: input.code,
      type: input.type,
      capabilities: input.capabilities ?? [],
      status: "ACTIVE",
      timezone: input.timezone ?? "Asia/Kolkata",
      nightAuditHour: input.nightAuditHour ?? 4,
      currency,
      locale,
      dateFormat: input.dateFormat ?? "YYYY-MM-DD",
      timeFormat: input.timeFormat ?? "12h",
      taxIdentifier: input.taxIdentifier ?? null,
      addressId: input.addressId ?? null,
      parentBranchId: input.parentBranchId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
    include: {
      address: true,
    },
  });

  return created as BranchListItemDto;
}

export async function updateBranchRecord(
  organizationId: string,
  branchId: string,
  input: UpdateBranchInput
): Promise<BranchListItemDto> {
  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  const updated = await prisma.branch.update({
    where: {
      id: branchId,
    },
    data: updateData as Prisma.BranchUpdateInput,
    include: {
      address: true,
    },
  });

  return updated as BranchListItemDto;
}
