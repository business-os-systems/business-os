import type { PrismaClient } from "@suite/db";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "@suite/core/errors";

export interface SwitchBranchParams {
  sessionToken: string;
  branchId: string;
  prisma: PrismaClient;
}

export interface BranchContextData {
  activeOrganizationId: string;
  activeBranchId: string;
  branch: {
    id: string;
    name: string;
    code: string;
    type: string;
    timezone: string;
    currency: string;
    locale: string;
  };
  effectiveRoles: string[];
  permissions: string[];
}

export interface SwitchBranchResult {
  success: true;
  data: BranchContextData;
}

export interface ActiveSessionDetails {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  branch: BranchContextData["branch"] | null;
  effectiveRoles: string[];
  permissions: string[];
}

/**
 * Validates branch membership and switches the active operational unit context for a user session,
 * updating active claims without requiring re-authentication.
 */
export async function switchActiveBranch(
  params: SwitchBranchParams
): Promise<SwitchBranchResult> {
  const { sessionToken, branchId, prisma } = params;

  if (!sessionToken) {
    throw new UnauthorizedError("Session token is required", {
      code: "AUTH_UNAUTHORIZED",
    });
  }

  // 1. Verify session exists and is active
  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    throw new UnauthorizedError("Active session not found or has expired", {
      code: "AUTH_UNAUTHORIZED",
    });
  }

  // 2. Fetch the target branch
  const targetBranch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { organization: true },
  });

  if (!targetBranch) {
    throw new NotFoundError(`Branch [${branchId}] not found`, {
      code: "BRANCH_NOT_FOUND",
    });
  }

  const organizationId = targetBranch.organizationId;

  // 3. Verify user has an active membership in the branch's organization
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: session.userId,
        organizationId,
      },
    },
  });

  if (!userOrg || userOrg.status !== "ACTIVE") {
    throw new ForbiddenError(
      "User does not possess an active membership in this organization",
      { code: "TENANT_ACCESS_DENIED" }
    );
  }

  // 4. Verify branch assignment or organization-wide administrative authority
  const branchRoleAssignments = await prisma.userBranchRole.findMany({
    where: {
      userId: session.userId,
      organizationId,
      OR: [
        { branchId: targetBranch.id },
        { branchId: null }, // Null denotes organization-wide master authority
      ],
    },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (branchRoleAssignments.length === 0) {
    throw new ForbiddenError(
      "User is not assigned to this branch and does not possess organization-wide authority",
      { code: "BRANCH_ACCESS_DENIED" }
    );
  }

  // 5. Aggregate effective roles & permissions
  const rolesSet = new Set<string>();
  const permissionsSet = new Set<string>();

  for (const assignment of branchRoleAssignments) {
    rolesSet.add(assignment.role.slug);
    if (assignment.role.isSystem) {
      permissionsSet.add("*");
    }
    for (const rp of assignment.role.permissions) {
      permissionsSet.add(rp.permission.action);
    }
  }

  // 6. Update session with new active branch and organization context
  await prisma.session.update({
    where: { id: session.id },
    data: {
      activeOrganizationId: organizationId,
      activeBranchId: targetBranch.id,
      updatedAt: new Date(),
    },
  });

  return {
    success: true,
    data: {
      activeOrganizationId: organizationId,
      activeBranchId: targetBranch.id,
      branch: {
        id: targetBranch.id,
        name: targetBranch.name,
        code: targetBranch.code,
        type: targetBranch.type,
        timezone: targetBranch.timezone,
        currency: targetBranch.currency,
        locale: targetBranch.locale,
      },
      effectiveRoles: Array.from(rolesSet),
      permissions: Array.from(permissionsSet),
    },
  };
}

/**
 * Retrieves the full active branch and tenant session context for an authenticated token.
 */
export async function getActiveBranchSession(
  sessionToken: string,
  prisma: PrismaClient
): Promise<ActiveSessionDetails> {
  if (!sessionToken) {
    throw new UnauthorizedError("Session token is required", {
      code: "AUTH_UNAUTHORIZED",
    });
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    throw new UnauthorizedError("Active session not found or has expired", {
      code: "AUTH_UNAUTHORIZED",
    });
  }

  let branchData: BranchContextData["branch"] | null = null;
  const rolesSet = new Set<string>();
  const permissionsSet = new Set<string>();

  if (session.activeBranchId && session.activeOrganizationId) {
    const branch = await prisma.branch.findUnique({
      where: { id: session.activeBranchId },
    });

    if (branch && branch.organizationId === session.activeOrganizationId) {
      branchData = {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        type: branch.type,
        timezone: branch.timezone,
        currency: branch.currency,
        locale: branch.locale,
      };

      const assignments = await prisma.userBranchRole.findMany({
        where: {
          userId: session.userId,
          organizationId: session.activeOrganizationId,
          OR: [{ branchId: branch.id }, { branchId: null }],
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      for (const assignment of assignments) {
        rolesSet.add(assignment.role.slug);
        if (assignment.role.isSystem) {
          permissionsSet.add("*");
        }
        for (const rp of assignment.role.permissions) {
          permissionsSet.add(rp.permission.action);
        }
      }
    }
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    activeOrganizationId: session.activeOrganizationId,
    activeBranchId: session.activeBranchId,
    branch: branchData,
    effectiveRoles: Array.from(rolesSet),
    permissions: Array.from(permissionsSet),
  };
}
