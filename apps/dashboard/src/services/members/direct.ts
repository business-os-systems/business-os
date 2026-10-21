import crypto from "node:crypto";
import { prisma, type Prisma } from "@suite/db";
import { hashPin } from "@suite/auth/pin";
import { hashToken } from "@suite/auth";
import type {
  CreateDirectMemberInput,
  CreateDirectMemberResult,
} from "./types";
import { ConflictError, NotFoundError } from "./types";
import { isAdministrativeRole } from "./safeguards";
import { listOrganizationMembers } from "./queries";

const MEMBERSHIP_CONFLICT_MESSAGES: Record<string, string> = {
  ACTIVE: "A user with this email address is already an active member of this organization.",
  INVITED: "A user with this email address has already been invited. You can copy their invitation link or resend it from the members directory.",
  SUSPENDED: "A member with this email address is currently suspended. You can reactivate them from the members directory.",
  REVOKED: "A member with this email address was previously revoked. You can restore their access by reactivating them from the members directory.",
};

function resolveTargetRoleIds(input: CreateDirectMemberInput): string[] {
  if (input.roleIds && input.roleIds.length > 0) return input.roleIds;
  if (input.roleId) return [input.roleId];
  return [];
}

function resolveTargetBranchIds(input: CreateDirectMemberInput): string[] {
  if (input.branchIds && input.branchIds.length > 0) return input.branchIds;
  if (input.branchId) return [input.branchId];
  return [];
}

async function resolveEffectiveInviterId(
  organizationId: string,
  inviterId?: string,
  fallbackUserId?: string
): Promise<string | undefined> {
  if (inviterId) return inviterId;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });
  const orgMetadata = org?.metadata as { creatorUserId?: string } | null;
  if (orgMetadata?.creatorUserId) return orgMetadata.creatorUserId;
  const firstAdmin = await prisma.userOrganization.findFirst({
    where: { organizationId, status: "ACTIVE" },
    select: { userId: true },
  });
  return firstAdmin?.userId ?? fallbackUserId;
}

/**
 * Directly pre-registers a staff member into the organization and issues an active invitation link for sharing.
 */
export async function createDirectMember(
  organizationId: string,
  input: CreateDirectMemberInput,
  inviterId?: string,
  baseUrl?: string
): Promise<CreateDirectMemberResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const targetRoleIds = resolveTargetRoleIds(input);

  if (targetRoleIds.length === 0) {
    throw new NotFoundError("At least one assigned role is required.");
  }

  // 1. Verify primary role exists
  const role = await prisma.role.findFirst({
    where: {
      id: targetRoleIds[0],
      OR: [{ organizationId: null }, { organizationId }],
    },
    include: {
      permissions: { include: { permission: true } },
    },
  });

  if (!role) {
    throw new NotFoundError("Selected role was not found.");
  }

  // 2. Check existing user and invitations via declarative dictionary
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      organizations: { where: { organizationId } },
    },
  });

  if (user && user.organizations.length > 0) {
    const existingOrg = user.organizations[0];
    if (existingOrg) {
      const message =
        MEMBERSHIP_CONFLICT_MESSAGES[existingOrg.status] ??
        "A member with this email address already belongs to this organization.";
      throw new ConflictError(message);
    }
  }

  const existingPendingInvitation = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId,
      email: normalizedEmail,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });

  if (existingPendingInvitation) {
    throw new ConflictError(
      "An active invitation for this email address already exists. You can copy the invitation link or manage it from the members directory."
    );
  }

  const pinHash = input.managerPin ? await hashPin(input.managerPin) : null;

  // 3. Upsert user in database
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: input.name.trim(),
        mobile: input.mobile?.trim() || null,
        managerPinHash: pinHash,
      },
      include: { organizations: true },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name.trim() || user.name,
        mobile: input.mobile?.trim() || user.mobile,
        managerPinHash: pinHash || user.managerPinHash,
      },
      include: { organizations: true },
    });
  }

  const targetBranchIds = resolveTargetBranchIds(input);

  // 4. Upsert UserOrganization & UserBranchRole in transaction
  const userOrg = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const uo = await tx.userOrganization.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId },
      },
      create: {
        userId: user.id,
        organizationId,
        status: "INVITED",
        terminalPinHash: pinHash,
      },
      update: {
        status: "INVITED",
        terminalPinHash: pinHash ?? undefined,
      },
    });

    await tx.userBranchRole.deleteMany({
      where: { userId: user.id, organizationId },
    });

    for (const rId of targetRoleIds) {
      if (targetBranchIds.length === 0) {
        await tx.userBranchRole.create({
          data: { userId: user.id, organizationId, roleId: rId, branchId: null },
        });
      } else {
        for (const bId of targetBranchIds) {
          await tx.userBranchRole.create({
            data: { userId: user.id, organizationId, roleId: rId, branchId: bId },
          });
        }
      }
    }

    return uo;
  });

  // 5. Generate secure cryptographic invitation link for direct share
  await prisma.organizationInvitation.deleteMany({
    where: { organizationId, email: normalizedEmail, status: "PENDING" },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const effectiveInviterId: string =
    (await resolveEffectiveInviterId(organizationId, inviterId, user.id)) ?? user.id;

  const createdInvitation = await prisma.organizationInvitation.create({
    data: {
      organizationId,
      email: normalizedEmail,
      roleId: role.id,
      token: hashedToken,
      status: "PENDING",
      expiresAt,
      inviterId: effectiveInviterId,
    },
    include: { role: true },
  });

  const effectiveBaseUrl = (baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const inviteUrl = `${effectiveBaseUrl}/invite/${token}`;

  const latestMembers = await listOrganizationMembers(organizationId);
  const createdDto = latestMembers.find((m) => m.id === userOrg.id);
  if (createdDto) {
    return {
      member: {
        ...createdDto,
        invitationToken: token,
        expiresAt: createdInvitation.expiresAt,
        status: "INVITED",
      },
      inviteUrl,
    };
  }

  let branchName = "All Branches";
  if (targetBranchIds.length === 1 && targetBranchIds[0]) {
    const branch = await prisma.branch.findUnique({
      where: { id: targetBranchIds[0] },
      select: { name: true },
    });
    if (branch) branchName = branch.name;
  }

  return {
    member: {
      id: userOrg.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile ?? null,
      image: user.image,
      status: "INVITED",
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
      isInvitation: false,
      invitationToken: token,
      expiresAt: createdInvitation.expiresAt,
      createdAt: userOrg.createdAt,
    },
    inviteUrl,
  };
}
