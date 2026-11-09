import { prisma } from "@suite/db";

export interface CreateOrganizationInput {
  readonly name: string;
  readonly slug: string;
  readonly currency: string;
  readonly country: string;
  readonly defaultLocale: string;
  readonly jurisdiction: string;
  readonly customDomain?: string;
}

export async function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      branches: {
        select: { id: true, name: true, code: true, type: true, status: true },
      },
    },
  });
}

export async function createOrganization(input: CreateOrganizationInput) {
  return prisma.organization.create({
    data: {
      name: input.name,
      slug: input.slug,
      currency: input.currency,
      country: input.country,
      defaultLocale: input.defaultLocale,
      jurisdiction: input.jurisdiction,
      customDomain: input.customDomain,
    },
  });
}

export async function findOrganizationById(id: string) {
  return prisma.organization.findUnique({
    where: { id },
    include: {
      branches: true,
      taxProfile: true,
    },
  });
}
