import { prisma } from "@suite/db";
import {
  NotFoundError,
  ConflictError,
  SafeguardViolationError,
} from "./members.service";

export interface PermissionDto {
  id: string;
  appId: string;
  action: string;
  description: string;
}

export interface RoleDetailDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  organizationId: string | null;
  permissions: string[];
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoleInput {
  name: string;
  slug?: string;
  description?: string | null;
  permissionActions: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissionActions?: string[];
}

/**
 * Lists all registered platform capability permissions
 */
export async function listSystemPermissions(): Promise<PermissionDto[]> {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ appId: "asc" }, { action: "asc" }],
  });

  return permissions.map((p) => ({
    id: p.id,
    appId: p.appId,
    action: p.action,
    description: p.description,
  }));
}

/**
 * Lists organization roles with their attached permissions and member counts
 */
export async function listOrganizationRolesWithPermissions(
  organizationId: string
): Promise<RoleDetailDto[]> {
  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { organizationId },
        { organizationId: null, slug: { in: ["tenant-owner", "owner"] } },
      ],
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      branchAssignments: {
        where: { organizationId },
        select: { id: true },
      },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  const hasLocalOwner = roles.some(
    (r) => r.organizationId === organizationId && (r.slug === "owner" || r.slug === "tenant-owner")
  );
  const filteredRoles = hasLocalOwner
    ? roles.filter((r) => r.organizationId !== null || r.slug !== "tenant-owner")
    : roles;

  return filteredRoles.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    isSystem: r.isSystem,
    organizationId: r.organizationId,
    permissions: r.permissions
      .map((rp) => rp.permission?.action)
      .filter((action): action is string => Boolean(action)),
    memberCount: r.branchAssignments.length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Creates a new custom role scoped to the active organization
 */
export async function createOrganizationRole(
  organizationId: string,
  input: CreateRoleInput
): Promise<RoleDetailDto> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Role name is required.");
  }

  const generatedSlug = (input.slug?.trim() || trimmedName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Check unique slug within organization
  const existingRole = await prisma.role.findFirst({
    where: {
      organizationId,
      slug: generatedSlug,
    },
  });

  if (existingRole) {
    throw new ConflictError(
      `A role with slug '${generatedSlug}' already exists in this organization.`
    );
  }

  // Find permissions by action strings
  const permissionRecords = await prisma.permission.findMany({
    where: {
      action: { in: input.permissionActions },
    },
  });

  return await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        organizationId,
        name: trimmedName,
        slug: generatedSlug,
        description: input.description?.trim() || null,
        isSystem: false,
      },
    });

    if (permissionRecords.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionRecords.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
        })),
      });
    }

    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      isSystem: role.isSystem,
      organizationId: role.organizationId,
      permissions: permissionRecords.map((p) => p.action),
      memberCount: 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  });
}

/**
 * Updates an existing custom role and synchronizes capability permissions
 */
export async function updateOrganizationRole(
  organizationId: string,
  roleId: string,
  input: UpdateRoleInput
): Promise<RoleDetailDto> {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      OR: [{ organizationId: null }, { organizationId }],
    },
    include: {
      branchAssignments: {
        where: { organizationId },
        select: { id: true },
      },
    },
  });

  if (!role) {
    throw new NotFoundError("Role record was not found.");
  }

  if (role.isSystem || role.organizationId === null) {
    throw new SafeguardViolationError(
      "Built-in system roles and global platform roles are protected and cannot be modified."
    );
  }

  if (role.organizationId && role.organizationId !== organizationId) {
    throw new NotFoundError("Role record was not found.");
  }

  return await prisma.$transaction(async (tx) => {
    const updateData: { name?: string; description?: string | null } = {};
    if (input.name && input.name.trim().length > 0) {
      updateData.name = input.name.trim();
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    const updatedRole = await tx.role.update({
      where: { id: role.id },
      data: updateData,
    });

    let activePermissions: string[] = [];

    if (input.permissionActions !== undefined) {
      const permissionRecords = await tx.permission.findMany({
        where: {
          action: { in: input.permissionActions },
        },
      });

      await tx.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      if (permissionRecords.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionRecords.map((p) => ({
            roleId: role.id,
            permissionId: p.id,
          })),
        });
      }

      activePermissions = permissionRecords.map((p) => p.action);
    } else {
      const currentRolePermissions = await tx.rolePermission.findMany({
        where: { roleId: role.id },
        include: { permission: true },
      });
      activePermissions = currentRolePermissions
        .map((rp) => rp.permission?.action)
        .filter((action): action is string => Boolean(action));
    }

    return {
      id: updatedRole.id,
      name: updatedRole.name,
      slug: updatedRole.slug,
      description: updatedRole.description,
      isSystem: updatedRole.isSystem,
      organizationId: updatedRole.organizationId,
      permissions: activePermissions,
      memberCount: role.branchAssignments.length,
      createdAt: updatedRole.createdAt,
      updatedAt: updatedRole.updatedAt,
    };
  });
}

/**
 * Deletes a custom role with safeguards against deleting system roles or roles currently in use
 */
export async function deleteOrganizationRole(
  organizationId: string,
  roleId: string
): Promise<void> {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      OR: [{ organizationId: null }, { organizationId }],
    },
  });

  if (!role) {
    throw new NotFoundError("Role record was not found.");
  }

  if (role.isSystem || role.organizationId === null) {
    throw new SafeguardViolationError(
      "Built-in system roles and global platform roles are protected and cannot be deleted."
    );
  }

  if (role.organizationId && role.organizationId !== organizationId) {
    throw new NotFoundError("Role record was not found.");
  }

  // Check if role is assigned to any members in this organization
  const assignedMembersCount = await prisma.userBranchRole.count({
    where: {
      roleId: role.id,
      organizationId,
    },
  });

  if (assignedMembersCount > 0) {
    throw new ConflictError(
      `Cannot delete role '${role.name}' because it is currently assigned to ${assignedMembersCount} team member(s). Please reassign them first.`
    );
  }

  // Check if role is referenced by pending invitations
  const pendingInvitesCount = await prisma.organizationInvitation.count({
    where: {
      roleId: role.id,
      organizationId,
      status: "PENDING",
    },
  });

  if (pendingInvitesCount > 0) {
    throw new ConflictError(
      `Cannot delete role '${role.name}' because it is referenced by ${pendingInvitesCount} pending team invitation(s).`
    );
  }

  await prisma.role.delete({
    where: { id: role.id },
  });
}
