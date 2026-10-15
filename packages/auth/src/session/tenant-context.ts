import type { PrismaClient } from "@suite/db";
import { ForbiddenError } from "@suite/core/errors";

export interface UserTenantMembership {
  organizationId: string;
  name: string;
  slug: string;
  role: string;
  logoUrl: string | null;
}

export interface SwitchTenantParams {
  userId: string;
  targetOrganizationId: string;
  prisma: PrismaClient;
}

export interface SwitchTenantResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  activeBranchId: string | null;
  activeBranchName: string | null;
  role: string;
  roleSlug: string;
  permissions: string[];
}

/**
 * Lists all active organizations/workspaces the user is an enrolled member of.
 */
export async function listUserTenants(
  userId: string,
  prisma: PrismaClient
): Promise<UserTenantMembership[]> {
  const memberships = await prisma.userOrganization.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const tenants: UserTenantMembership[] = [];

  for (const m of memberships) {
    // Resolve user's highest role in this organization
    const branchRole = await prisma.userBranchRole.findFirst({
      where: {
        userId,
        organizationId: m.organizationId,
      },
      include: {
        role: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const orgMetadata = (m.organization.metadata || {}) as Record<string, unknown>;
    const logoUrl =
      typeof orgMetadata.logoUrl === "string"
        ? orgMetadata.logoUrl
        : null;

    tenants.push({
      organizationId: m.organizationId,
      name: m.organization.name,
      slug: m.organization.slug,
      role: branchRole?.role?.name || "Member",
      logoUrl,
    });
  }

  return tenants;
}

/**
 * Validates tenant membership and switches the active workspace context for a user session,
 * returning the new active claims for cookie re-minting without requiring re-authentication.
 */
export async function switchActiveTenant(
  params: SwitchTenantParams
): Promise<SwitchTenantResult> {
  const { userId, targetOrganizationId, prisma } = params;

  if (!userId) {
    throw new ForbiddenError("User ID is required to switch tenant context", {
      code: "AUTH_UNAUTHORIZED",
    });
  }

  // 1. Verify user has an active membership in the target organization
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: targetOrganizationId,
      },
    },
    include: {
      organization: {
        include: {
          branches: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!userOrg || userOrg.status !== "ACTIVE") {
    throw new ForbiddenError(
      "You do not have active access to the requested organization.",
      { code: "FORBIDDEN" }
    );
  }

  // 2. Fetch user's assigned branch roles in target organization
  const branchRoles = await prisma.userBranchRole.findMany({
    where: {
      userId,
      organizationId: targetOrganizationId,
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
      branch: true,
    },
  });

  // 3. Resolve active branch context
  const primaryBranch =
    branchRoles.find((br) => br.branchId !== null)?.branch ||
    userOrg.organization.branches[0] ||
    null;

  const activeBranchId = primaryBranch?.id || null;
  const activeBranchName = primaryBranch?.name || null;

  // 4. Resolve primary role and collect all permissions
  const primaryRole = branchRoles[0]?.role;
  const roleName = primaryRole?.name || "Member";
  const roleSlug = primaryRole?.slug || "member";

  const permissionsSet = new Set<string>();
  for (const br of branchRoles) {
    if (br.role?.permissions) {
      for (const rp of br.role.permissions) {
        if (rp.permission?.action) {
          permissionsSet.add(rp.permission.action);
        }
      }
    }
  }

  return {
    organizationId: userOrg.organization.id,
    organizationName: userOrg.organization.name,
    organizationSlug: userOrg.organization.slug,
    activeBranchId,
    activeBranchName,
    role: roleName,
    roleSlug,
    permissions: Array.from(permissionsSet),
  };
}
