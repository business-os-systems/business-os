import crypto from "node:crypto";
import { prisma } from "@suite/db";
import type { InviteMemberInput, MemberListItemDto } from "./types";
import { ConflictError, NotFoundError } from "./types";
import { isAdministrativeRole } from "./safeguards";

const INVITATION_CONFLICT_MESSAGES: Record<string, string> = {
  ACTIVE:
    "A user with this email address is already an active member of this organization. To change their permissions, please update their assigned role directly.",
  SUSPENDED:
    "Cannot issue invitation for a suspended or revoked team member. Please reactivate them first.",
  REVOKED:
    "Cannot issue invitation for a suspended or revoked team member. Please reactivate them first.",
};

function resolveTargetRoleIds(input: InviteMemberInput): string[] {
  if (input.roleIds && input.roleIds.length > 0) return input.roleIds;
  if (input.roleId) return [input.roleId];
  return [];
}

function resolveTargetBranchIds(input: InviteMemberInput): string[] {
  if (input.branchIds && input.branchIds.length > 0) return input.branchIds;
  if (input.branchId) return [input.branchId];
  return [];
}

function resolveMemberName(userName?: string | null, email?: string): string {
  if (userName && userName.trim().length > 0) return userName.trim();
  if (email) {
    const localPart = email.split("@")[0];
    if (localPart) return localPart;
  }
  return "Invited User";
}

/**
 * Creates a new organization invitation and generates a secure link.
 * All mutations (branch roles and invitation records) are executed within an atomic transaction (Issue 08).
 */
export async function inviteOrganizationMember(
  organizationId: string,
  inviterId: string,
  input: InviteMemberInput
): Promise<{ invitation: MemberListItemDto; inviteUrl: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  // Check existing user membership in organization via declarative conflict lookup
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      organizations: {
        where: { organizationId },
      },
    },
  });

  const existingOrg = existingUser?.organizations[0];
  if (existingOrg) {
    const conflictMessage = INVITATION_CONFLICT_MESSAGES[existingOrg.status];
    if (conflictMessage) {
      throw new ConflictError(conflictMessage);
    }
  }

  const targetRoleIds = resolveTargetRoleIds(input);
  if (targetRoleIds.length === 0) {
    throw new NotFoundError("At least one assigned role is required.");
  }

  // Verify primary role exists
  const role = await prisma.role.findFirst({
    where: {
      id: targetRoleIds[0],
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

  if (!role) {
    throw new NotFoundError("Selected role was not found.");
  }

  const targetBranchIds = resolveTargetBranchIds(input);

  // Execute all mutations atomically inside a transaction (Issue 08)
  const { createdInvitation, token } = await prisma.$transaction(async (tx) => {
    // If user already exists in org, update their branch role to the invited roles & branches
    if (existingUser) {
      await tx.userBranchRole.deleteMany({
        where: {
          userId: existingUser.id,
          organizationId,
        },
      });

      for (const rId of targetRoleIds) {
        if (targetBranchIds.length === 0) {
          await tx.userBranchRole.create({
            data: {
              userId: existingUser.id,
              organizationId,
              roleId: rId,
              branchId: null,
            },
          });
        } else {
          for (const bId of targetBranchIds) {
            await tx.userBranchRole.create({
              data: {
                userId: existingUser.id,
                organizationId,
                roleId: rId,
                branchId: bId,
              },
            });
          }
        }
      }
    }

    // Check for an existing unexpired pending invitation with the same role for idempotent reuse
    const existingPending = await tx.organizationInvitation.findFirst({
      where: {
        organizationId,
        email: normalizedEmail,
        status: "PENDING",
        roleId: role.id,
        expiresAt: { gt: new Date() },
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
      },
    });

    if (existingPending) {
      const refreshedExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const updated = await tx.organizationInvitation.update({
        where: { id: existingPending.id },
        data: {
          expiresAt: refreshedExpiresAt,
          inviterId,
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
        },
      });
      return { createdInvitation: updated, token: existingPending.token };
    }

    // Cancel any existing pending invitation for this email to avoid duplicates
    await tx.organizationInvitation.deleteMany({
      where: {
        organizationId,
        email: normalizedEmail,
        status: "PENDING",
      },
    });

    const secureToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const created = await tx.organizationInvitation.create({
      data: {
        organizationId,
        email: normalizedEmail,
        roleId: role.id,
        token: secureToken,
        status: "PENDING",
        expiresAt,
        inviterId,
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
      },
    });

    return { createdInvitation: created, token: secureToken };
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const inviteUrl = `${baseUrl}/invite/${token}`;

  let branchName = "All Branches";
  if (input.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      select: { name: true },
    });
    if (branch) branchName = branch.name;
  }

  const dto: MemberListItemDto = {
    id: existingOrg ? existingOrg.id : createdInvitation.id,
    userId: existingUser ? existingUser.id : null,
    name: resolveMemberName(existingUser?.name, normalizedEmail),
    email: createdInvitation.email,
    mobile: existingUser?.mobile ?? null,
    image: existingUser?.image ?? null,
    status: (existingOrg?.status as MemberListItemDto["status"]) || "INVITED",
    roleId: role.id,
    roleName: role.name,
    roleSlug: role.slug,
    isOwner: isAdministrativeRole(role),
    isPrimaryOwner: false,
    roleIds: targetRoleIds,
    roleNames: [role.name],
    branchId: targetBranchIds[0] ?? null,
    branchName,
    branchIds: targetBranchIds,
    branchNames: [branchName],
    isInvitation: !existingOrg,
    invitationToken: token,
    expiresAt: createdInvitation.expiresAt,
    createdAt: createdInvitation.createdAt,
  };

  return { invitation: dto, inviteUrl };
}

/**
 * Cancels a pending organization invitation.
 */
export async function cancelOrganizationInvitation(
  organizationId: string,
  invitationId: string
): Promise<void> {
  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      id: invitationId,
      organizationId,
    },
  });

  if (!invitation) {
    throw new NotFoundError("Invitation record not found.");
  }

  await prisma.organizationInvitation.delete({
    where: { id: invitation.id },
  });
}
