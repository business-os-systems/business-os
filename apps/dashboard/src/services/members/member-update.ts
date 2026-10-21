import { prisma, type Prisma } from "@suite/db";
import { hashPin } from "@suite/auth/pin";
import type {
  MemberListItemDto,
  UpdateMemberDetailsInput,
  UpdateMemberRoleInput,
} from "./types";
import { NotFoundError } from "./types";
import {
  isAdministrativeRole,
  countOtherActiveAdmins,
  assertNotLastAdmin,
} from "./safeguards";
import { listOrganizationMembers } from "./queries";

function resolveTargetRoleIds(
  input: UpdateMemberRoleInput,
  currentRoleId?: string
): string[] {
  if (input.roleIds && input.roleIds.length > 0) return input.roleIds;
  if (input.roleId) return [input.roleId];
  if (currentRoleId) return [currentRoleId];
  return [];
}

function resolveTargetBranchIds(
  input: UpdateMemberRoleInput,
  existingBranchRoles: Array<{ branchId: string | null }>
): string[] {
  if (input.branchIds !== undefined) return input.branchIds;
  if (input.branchId !== undefined) {
    return input.branchId ? [input.branchId] : [];
  }
  return existingBranchRoles
    .map((br) => br.branchId)
    .filter((id): id is string => Boolean(id));
}

function hasRoleOrBranchAssignmentInput(input: UpdateMemberRoleInput): boolean {
  return (
    input.roleId !== undefined ||
    input.roleIds !== undefined ||
    input.branchId !== undefined ||
    input.branchIds !== undefined
  );
}

/**
 * Updates a member's profile details, role, and branch assignment with Last-Admin Safeguard.
 */
export async function updateMemberDetails(
  organizationId: string,
  memberId: string,
  input: UpdateMemberDetailsInput
): Promise<MemberListItemDto> {
  const userOrg = await prisma.userOrganization.findFirst({
    where: {
      id: memberId,
      organizationId,
    },
    include: {
      user: {
        include: {
          branchRoles: {
            where: { organizationId },
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
          },
        },
      },
    },
  });

  if (!userOrg) {
    throw new NotFoundError("Organization membership record not found.");
  }

  const currentRole =
    userOrg.user.branchRoles.find((br) => br.branchId === null)?.role ??
    userOrg.user.branchRoles[0]?.role;
  const isCurrentAdmin = currentRole ? isAdministrativeRole(currentRole) : false;

  let newRole = currentRole;

  if (input.roleId && (!currentRole || currentRole.id !== input.roleId)) {
    const roleCandidate = await prisma.role.findFirst({
      where: {
        id: input.roleId,
        OR: [{ organizationId: null }, { organizationId }],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!roleCandidate) {
      throw new NotFoundError("Selected new role was not found.");
    }

    newRole = roleCandidate;
    const isTargetAdmin = isAdministrativeRole(newRole);

    // Last-Admin Safeguard: Cannot demote the last administrator
    if (isCurrentAdmin && !isTargetAdmin) {
      const otherActiveAdminsCount = await countOtherActiveAdmins(
        organizationId,
        userOrg.id
      );
      assertNotLastAdmin(otherActiveAdminsCount, "demote");
    }
  }

  // Hash new PIN if provided
  const pinHash = input.managerPin ? await hashPin(input.managerPin) : null;

  // Execute updates in transaction
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Update user profile details
    const userUpdateData: {
      name?: string;
      mobile?: string | null;
      managerPinHash?: string | null;
    } = {};
    if (input.name && input.name.trim().length >= 2) {
      userUpdateData.name = input.name.trim();
    }
    if (input.mobile !== undefined) {
      userUpdateData.mobile = input.mobile?.trim() || null;
    }
    if (pinHash) {
      userUpdateData.managerPinHash = pinHash;
    }
    if (Object.keys(userUpdateData).length > 0) {
      await tx.user.update({
        where: { id: userOrg.userId },
        data: userUpdateData,
      });
    }

    // 2. Update terminal PIN hash on userOrganization if PIN provided
    if (pinHash) {
      await tx.userOrganization.update({
        where: { id: userOrg.id },
        data: { terminalPinHash: pinHash },
      });
    }

    // 3. Update branch role assignments if roleId or branchId was specified
    if (hasRoleOrBranchAssignmentInput(input)) {
      const targetRoleIds = resolveTargetRoleIds(input, currentRole?.id);
      const targetBranchIds = resolveTargetBranchIds(input, userOrg.user.branchRoles);

      await tx.userBranchRole.deleteMany({
        where: {
          userId: userOrg.userId,
          organizationId,
        },
      });

      for (const rId of targetRoleIds) {
        if (targetBranchIds.length === 0) {
          await tx.userBranchRole.create({
            data: {
              userId: userOrg.userId,
              organizationId,
              roleId: rId,
              branchId: null,
            },
          });
        } else {
          for (const bId of targetBranchIds) {
            await tx.userBranchRole.create({
              data: {
                userId: userOrg.userId,
                organizationId,
                roleId: rId,
                branchId: bId,
              },
            });
          }
        }
      }
    }
  });

  const latestMembers = await listOrganizationMembers(organizationId);
  const updatedDto = latestMembers.find((m) => m.id === userOrg.id);
  if (updatedDto) {
    return updatedDto;
  }

  const targetRoleIds = resolveTargetRoleIds(input, newRole?.id);
  const targetBranchIds = resolveTargetBranchIds(input, []);

  return {
    id: userOrg.id,
    userId: userOrg.userId,
    name: input.name?.trim() || userOrg.user.name || "Team Member",
    email: userOrg.user.email,
    mobile: input.mobile !== undefined ? input.mobile : userOrg.user.mobile ?? null,
    image: userOrg.user.image,
    status: userOrg.status as MemberListItemDto["status"],
    roleId: newRole?.id ?? "",
    roleName: newRole?.name ?? "Team Member",
    roleSlug: newRole?.slug ?? "member",
    isOwner: newRole ? isAdministrativeRole(newRole) : false,
    isPrimaryOwner: false,
    roleIds: targetRoleIds,
    roleNames: [newRole?.name ?? "Team Member"],
    branchId: input.branchId ?? null,
    branchName: "All Branches",
    branchIds: targetBranchIds,
    branchNames: ["All Branches"],
    isInvitation: false,
    invitationToken: null,
    expiresAt: null,
    createdAt: userOrg.createdAt,
  };
}

/**
 * Updates a member's role assignment with Last-Admin Safeguard (delegates to updateMemberDetails).
 */
export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  input: UpdateMemberRoleInput
): Promise<MemberListItemDto> {
  return updateMemberDetails(organizationId, memberId, input);
}
