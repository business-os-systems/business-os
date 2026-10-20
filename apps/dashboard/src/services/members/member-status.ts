import { prisma } from "@suite/db";
import type { MemberListItemDto, UpdateMemberStatusInput } from "./types";
import { NotFoundError } from "./types";
import {
  isAdministrativeRole,
  countOtherActiveAdmins,
  getPrimaryOwnerUserId,
  assertNotPrimaryOwner,
  assertNotLastAdmin,
} from "./safeguards";

/**
 * Updates a member's status (ACTIVE, SUSPENDED, REVOKED) with Last-Admin Safeguard and Session Termination.
 */
export async function updateMemberStatus(
  organizationId: string,
  memberId: string,
  input: UpdateMemberStatusInput
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

  // Primary Owner Immunity Safeguard
  if (input.status === "SUSPENDED") {
    const creatorUserId = await getPrimaryOwnerUserId(organizationId);
    assertNotPrimaryOwner(creatorUserId, userOrg.userId, "suspend");
  }

  // Last-Admin Safeguard: Cannot suspend the last administrator
  if (isCurrentAdmin && input.status === "SUSPENDED") {
    const otherActiveAdminsCount = await countOtherActiveAdmins(
      organizationId,
      userOrg.id
    );
    assertNotLastAdmin(otherActiveAdminsCount, "suspend");
  }

  // Update status
  const updatedUserOrg = await prisma.userOrganization.update({
    where: { id: userOrg.id },
    data: { status: input.status },
  });

  // Enterprise Immediate Session Termination & Invitation Revocation
  if (input.status === "SUSPENDED") {
    await prisma.session.deleteMany({
      where: {
        userId: userOrg.userId,
        activeOrganizationId: organizationId,
      },
    });

    await prisma.organizationInvitation.deleteMany({
      where: {
        organizationId,
        email: userOrg.user.email.toLowerCase(),
        status: "PENDING",
      },
    });
  }

  const branch = userOrg.user.branchRoles[0]?.branch;

  return {
    id: updatedUserOrg.id,
    userId: userOrg.userId,
    name: userOrg.user.name || userOrg.user.email.split("@")[0] || "Team Member",
    email: userOrg.user.email,
    mobile: userOrg.user.mobile ?? null,
    image: userOrg.user.image,
    status: (updatedUserOrg.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE") as MemberListItemDto["status"],
    roleId: currentRole?.id ?? "",
    roleName: currentRole?.name ?? "Team Member",
    roleSlug: currentRole?.slug ?? "member",
    isOwner: isCurrentAdmin,
    isPrimaryOwner: false,
    roleIds: [currentRole?.id ?? ""],
    roleNames: [currentRole?.name ?? "Team Member"],
    branchId: branch?.id ?? null,
    branchName: branch ? branch.name : "All Branches",
    branchIds: branch?.id ? [branch.id] : [],
    branchNames: [branch ? branch.name : "All Branches"],
    isInvitation: false,
    invitationToken: null,
    expiresAt: null,
    createdAt: updatedUserOrg.createdAt,
  };
}

/**
 * Permanently removes a member from the workspace with Primary Owner Immunity and Last-Admin Safeguards.
 */
export async function removeMember(
  organizationId: string,
  memberId: string
): Promise<{ success: boolean; message: string }> {
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
            },
          },
        },
      },
    },
  });

  if (!userOrg) {
    // Check if it's an invitation record
    const invitation = await prisma.organizationInvitation.findFirst({
      where: {
        id: memberId,
        organizationId,
      },
    });

    if (invitation) {
      await prisma.organizationInvitation.delete({
        where: { id: invitation.id },
      });
      return { success: true, message: `Invitation for ${invitation.email} removed.` };
    }

    throw new NotFoundError("Organization membership record not found.");
  }

  // Primary Owner Immunity Safeguard
  const creatorUserId = await getPrimaryOwnerUserId(organizationId);
  assertNotPrimaryOwner(creatorUserId, userOrg.userId, "remove");

  // Last-Admin Safeguard: Cannot remove the last administrator
  const currentRole =
    userOrg.user.branchRoles.find((br) => br.branchId === null)?.role ??
    userOrg.user.branchRoles[0]?.role;
  const isCurrentAdmin = currentRole ? isAdministrativeRole(currentRole) : false;

  if (isCurrentAdmin) {
    const otherActiveAdminsCount = await countOtherActiveAdmins(
      organizationId,
      userOrg.id
    );
    assertNotLastAdmin(otherActiveAdminsCount, "remove");
  }

  // Execute Hard Delete in a transaction
  await prisma.$transaction([
    prisma.userBranchRole.deleteMany({
      where: {
        userId: userOrg.userId,
        organizationId,
      },
    }),
    prisma.organizationInvitation.deleteMany({
      where: {
        organizationId,
        email: userOrg.user.email.toLowerCase(),
      },
    }),
    prisma.session.deleteMany({
      where: {
        userId: userOrg.userId,
        activeOrganizationId: organizationId,
      },
    }),
    prisma.userOrganization.delete({
      where: {
        id: userOrg.id,
      },
    }),
  ]);

  return { success: true, message: `Member ${userOrg.user.email} removed from organization.` };
}
