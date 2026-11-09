import { prisma } from "@suite/db";

export interface BranchLookup {
  readonly id: string;
  readonly organizationId?: string;
}

/**
 * Tenant-scoped branch reads live here so the route validates and maps only
 * (P2). Every query filters by organization when the caller supplies one.
 */
export async function listOrganizationBranches(organizationId: string) {
  return prisma.branch.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function findBranchById(lookup: BranchLookup) {
  const hasOrganization =
    lookup.organizationId !== undefined && lookup.organizationId.length > 0;
  const where = hasOrganization
    ? { id: lookup.id, organizationId: lookup.organizationId }
    : { id: lookup.id };

  return prisma.branch.findFirst({
    where,
    include: {
      organization: true,
      subBranches: true,
      address: true,
    },
  });
}
