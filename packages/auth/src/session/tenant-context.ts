import type { PrismaClient } from "@suite/db";
import { ForbiddenError } from "@suite/core/errors";
import { extractEffectivePermissions } from "./permissions.js";

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
      // A suspended workspace is not selectable: signing into one would mint
      // a live session for a tenant the platform has blocked (FR-017).
      organization: {
        status: { notIn: ["ARCHIVED", "SUSPENDED"] },
      },
    },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (memberships.length === 0) {
    return [];
  }

  const orgIds = memberships.map((m) => m.organizationId);
  const branchRoleByOrg = new Map<string, { role?: { name: string } | null }>();

  // Issue 16: Single batched findMany query replacing N+1 findFirst query loop
  if (typeof prisma?.userBranchRole?.findMany === "function") {
    const branchRoles = await prisma.userBranchRole.findMany({
      where: {
        userId,
        organizationId: { in: orgIds },
      },
      include: {
        role: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (Array.isArray(branchRoles)) {
      for (const br of branchRoles) {
        if (!branchRoleByOrg.has(br.organizationId)) {
          branchRoleByOrg.set(br.organizationId, br);
        }
      }
    }
  }

  // Graceful fallback for test mocks providing only findFirst
  for (const m of memberships) {
    if (!branchRoleByOrg.has(m.organizationId) && typeof prisma?.userBranchRole?.findFirst === "function") {
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
      if (branchRole) {
        branchRoleByOrg.set(m.organizationId, branchRole);
      }
    }
  }

  return memberships.map((m) => {
    const branchRole = branchRoleByOrg.get(m.organizationId);
    const orgMetadata = (m.organization.metadata || {}) as Record<string, unknown>;
    const logoUrl =
      typeof orgMetadata.logoUrl === "string"
        ? orgMetadata.logoUrl
        : null;

    return {
      organizationId: m.organizationId,
      name: m.organization.name,
      slug: m.organization.slug,
      role: branchRole?.role?.name || "Member",
      logoUrl,
    };
  });
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

  if (userOrg.organization.status === "ARCHIVED") {
    throw new ForbiddenError(
      "This organization has been archived and cannot be accessed.",
      { code: "ORGANIZATION_ARCHIVED" }
    );
  }

  if (userOrg.organization.status === "SUSPENDED") {
    throw new ForbiddenError(
      "This organization is suspended and cannot be accessed.",
      { code: "ORGANIZATION_SUSPENDED" }
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
  const permissions = extractEffectivePermissions(branchRoles);

  return {
    organizationId: userOrg.organization.id,
    organizationName: userOrg.organization.name,
    organizationSlug: userOrg.organization.slug,
    activeBranchId,
    activeBranchName,
    role: roleName,
    roleSlug,
    permissions,
  };
}
