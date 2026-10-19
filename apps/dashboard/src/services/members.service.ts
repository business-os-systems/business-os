import crypto from "node:crypto";
import { prisma } from "@suite/db";
import { hashPin } from "@suite/auth";

export interface MemberListItemDto {
  id: string; // UserOrganization.id OR OrganizationInvitation.id
  userId: string | null;
  name: string;
  email: string;
  mobile: string | null;
  image: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  roleId: string;
  roleName: string;
  roleSlug: string;
  isOwner: boolean;
  isPrimaryOwner: boolean; // True for the creator who signed up for this organization; immune to suspension or deletion
  roleIds: string[];
  roleNames: string[];
  branchId: string | null;
  branchName: string;
  branchIds: string[];
  branchNames: string[];
  isInvitation: boolean;
  invitationToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface RoleOptionDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
}

export interface InviteMemberInput {
  email: string;
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
  isPreRegistered?: boolean;
}

export interface UpdateMemberDetailsInput {
  name?: string;
  mobile?: string | null;
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
  managerPin?: string | null;
}

export interface UpdateMemberRoleInput {
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
}

export interface UpdateMemberStatusInput {
  status: "ACTIVE" | "SUSPENDED";
}

export class SafeguardViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeguardViolationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Checks if a role is considered an Owner/Admin role
 */
export function isAdministrativeRole(role: { slug: string; permissions?: Array<{ permission?: { action?: string } }> }): boolean {
  if (role.slug === "tenant-owner" || role.slug === "owner" || role.slug === "admin") {
    return true;
  }
  if (role.permissions && Array.isArray(role.permissions)) {
    return role.permissions.some((rp) => {
      const action = rp.permission?.action;
      return action === "*" || action === "core:*" || action === "core:users:manage";
    });
  }
  return false;
}

/**
 * Lists all active, suspended, and invited members for an organization
 */
export async function listOrganizationMembers(organizationId: string): Promise<MemberListItemDto[]> {
  // 1. Fetch all members with their user details, branch roles, and roles
  const userOrgs =
    (await prisma.userOrganization.findMany({
      where: {
        organizationId,
        status: { not: "REVOKED" },
      },
      include: {
        user: {
          include: {
            accounts: {
              where: { providerId: "credential" },
              select: { id: true },
            },
            branchRoles: {
              where: { organizationId },
              include: {
                role: true,
                branch: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })) ?? [];

  // 2. Fetch all pending invitations for this organization
  const pendingInvites =
    (await prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        status: "PENDING",
      },
      include: {
        role: true,
      },
      orderBy: { createdAt: "desc" },
    })) ?? [];

  // 3. Map pending invites by email for merging with existing members
  const pendingByEmail = new Map(
    pendingInvites.map((inv) => [inv.email.toLowerCase(), inv])
  );

  // 4. Retrieve Organization metadata to identify primary founder / creator
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });

  const earliestUo =
    userOrgs.length > 0 && userOrgs[0]
      ? userOrgs.reduce(
          (earliest, curr) =>
            curr.createdAt < earliest.createdAt ? curr : earliest,
          userOrgs[0]
        )
      : null;

  interface OrgMetadataRecord {
    creatorUserId?: string;
  }
  const orgMetadata =
    org?.metadata && typeof org.metadata === "object"
      ? (org.metadata as OrgMetadataRecord)
      : null;
  const creatorUserId = orgMetadata?.creatorUserId ?? earliestUo?.userId;

  // 5. Normalize UserOrganizations into MemberListItemDto
  const activeMembers: MemberListItemDto[] = userOrgs.map((uo) => {
    const branchRoles = uo.user.branchRoles;

    // Collect all distinct assigned roles
    const roleMap = new Map<string, { id: string; name: string; slug: string }>();
    const branchMap = new Map<string, { id: string; name: string }>();
    let hasAllBranches = false;

    for (const br of branchRoles) {
      if (br.role) {
        roleMap.set(br.role.id, {
          id: br.role.id,
          name: br.role.name,
          slug: br.role.slug,
        });
      }
      if (br.branchId === null || br.branchId === "") {
        hasAllBranches = true;
      } else if (br.branch) {
        branchMap.set(br.branch.id, {
          id: br.branch.id,
          name: br.branch.name,
        });
      }
    }

    const distinctRoles = Array.from(roleMap.values());
    const distinctBranches = Array.from(branchMap.values());

    const globalRole =
      branchRoles.find((br) => br.branchId === null) ?? branchRoles[0];
    const role = globalRole?.role;
    const branch = globalRole?.branch;

    const isPrimaryOwner = Boolean(creatorUserId && uo.userId === creatorUserId);
    const isOwner =
      isPrimaryOwner || (role ? isAdministrativeRole(role) : false);
    const matchedInvite = pendingByEmail.get(uo.user.email.toLowerCase());

    const roleIds =
      distinctRoles.length > 0
        ? distinctRoles.map((r) => r.id)
        : role
        ? [role.id]
        : matchedInvite?.role.id
        ? [matchedInvite.role.id]
        : [];

    const roleNames =
      distinctRoles.length > 0
        ? distinctRoles.map((r) => r.name)
        : role
        ? [role.name]
        : matchedInvite?.role.name
        ? [matchedInvite.role.name]
        : ["Team Member"];

    const branchIds = hasAllBranches ? [] : distinctBranches.map((b) => b.id);
    const branchNames = hasAllBranches
      ? ["All Branches"]
      : distinctBranches.length > 0
      ? distinctBranches.map((b) => b.name)
      : ["All Branches"];

    const hasPassword = Boolean(
      (uo.user as { accounts?: Array<{ id: string }> }).accounts &&
      (uo.user as { accounts?: Array<{ id: string }> }).accounts!.length > 0
    );
    let memberStatus = (uo.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE") as MemberListItemDto["status"];
    if (!isPrimaryOwner && memberStatus !== "SUSPENDED") {
      if (!hasPassword || uo.status === "INVITED") {
        memberStatus = "INVITED";
      }
    }

    return {
      id: uo.id,
      userId: uo.userId,
      name: uo.user.name || uo.user.email.split("@")[0] || "Team Member",
      email: uo.user.email,
      mobile: uo.user.mobile ?? null,
      image: uo.user.image,
      status: memberStatus,
      roleId: role?.id ?? matchedInvite?.role.id ?? roleIds[0] ?? "",
      roleName: role?.name ?? matchedInvite?.role.name ?? roleNames[0] ?? "Team Member",
      roleSlug: role?.slug ?? matchedInvite?.role.slug ?? "member",
      isOwner,
      isPrimaryOwner,
      roleIds,
      roleNames,
      branchId: branch?.id ?? null,
      branchName: branch ? branch.name : "All Branches",
      branchIds,
      branchNames,
      isInvitation: false,
      invitationToken: matchedInvite?.token ?? null,
      expiresAt: matchedInvite?.expiresAt ?? null,
      createdAt: uo.createdAt,
    };
  });

  // 6. Normalize external Pending Invitations into MemberListItemDto (deduplicated by email)
  const existingEmails = new Set(
    activeMembers.map((m) => m.email.toLowerCase())
  );
  const seenInviteEmails = new Set<string>();
  const externalPendingInvites = pendingInvites.filter((inv) => {
    const emailKey = inv.email.toLowerCase();
    if (existingEmails.has(emailKey) || seenInviteEmails.has(emailKey)) {
      return false;
    }
    seenInviteEmails.add(emailKey);
    return true;
  });

  const invitedMembers: MemberListItemDto[] = externalPendingInvites.map(
    (inv) => {
      const isOwner = inv.role ? isAdministrativeRole(inv.role) : false;

      return {
        id: inv.id,
        userId: null,
        name: inv.email.split("@")[0] || "Invited User",
        email: inv.email,
        mobile: null,
        image: null,
        status: "INVITED",
        roleId: inv.role.id,
        roleName: inv.role.name,
        roleSlug: inv.role.slug,
        isOwner,
        isPrimaryOwner: false,
        roleIds: [inv.role.id],
        roleNames: [inv.role.name],
        branchId: null,
        branchName: "All Branches",
        branchIds: [],
        branchNames: ["All Branches"],
        isInvitation: true,
        invitationToken: inv.token,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      };
    }
  );

  return [...activeMembers, ...invitedMembers];
}

/**
 * Lists dynamic and system roles available to the organization
 */
export async function listOrganizationRoles(organizationId: string): Promise<RoleOptionDto[]> {
  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { organizationId },
        { organizationId: null, slug: { in: ["tenant-owner", "owner"] } },
      ],
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
  }));
}

/**
 * Creates a new organization invitation and generates a secure link
 */
export async function inviteOrganizationMember(
  organizationId: string,
  inviterId: string,
  input: InviteMemberInput
): Promise<{ invitation: MemberListItemDto; inviteUrl: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  // Check existing user membership in organization
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
    if (existingOrg.status === "ACTIVE") {
      throw new ConflictError(
        "A user with this email address is already an active member of this organization. To change their permissions, please update their assigned role directly."
      );
    }
    if (existingOrg.status === "SUSPENDED" || existingOrg.status === "REVOKED") {
      throw new ConflictError(
        "Cannot issue invitation for a suspended or revoked team member. Please reactivate them first."
      );
    }
  }

  const targetRoleIds =
    input.roleIds && input.roleIds.length > 0
      ? input.roleIds
      : input.roleId
      ? [input.roleId]
      : [];

  if (targetRoleIds.length === 0) {
    throw new NotFoundError("At least one assigned role is required.");
  }

  // Verify primary role exists
  const role = await prisma.role.findFirst({
    where: {
      id: targetRoleIds[0],
      OR: [{ organizationId: null }, { organizationId }],
    },
  });

  if (!role) {
    throw new NotFoundError("Selected role was not found.");
  }

  const targetBranchIds =
    input.branchIds && input.branchIds.length > 0
      ? input.branchIds
      : input.branchId
      ? [input.branchId]
      : [];

  // If user already exists in org, update their branch role to the invited roles & branches
  if (existingUser) {
    await prisma.userBranchRole.deleteMany({
      where: {
        userId: existingUser.id,
        organizationId,
      },
    });

    for (const rId of targetRoleIds) {
      if (targetBranchIds.length === 0) {
        await prisma.userBranchRole.create({
          data: {
            userId: existingUser.id,
            organizationId,
            roleId: rId,
            branchId: null,
          },
        });
      } else {
        for (const bId of targetBranchIds) {
          await prisma.userBranchRole.create({
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
  const existingPending = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId,
      email: normalizedEmail,
      status: "PENDING",
      roleId: role.id,
      expiresAt: { gt: new Date() },
    },
    include: {
      role: true,
    },
  });

  let createdInvitation;
  let token: string;

  if (existingPending) {
    // Idempotent Token Reuse: extend expiration by 7 days and reuse the existing token
    const refreshedExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    createdInvitation = await prisma.organizationInvitation.update({
      where: { id: existingPending.id },
      data: {
        expiresAt: refreshedExpiresAt,
        inviterId,
      },
      include: {
        role: true,
      },
    });
    token = existingPending.token;
  } else {
    // Cancel any existing pending invitation for this email to avoid duplicates (e.g. if role changed or expired)
    await prisma.organizationInvitation.deleteMany({
      where: {
        organizationId,
        email: normalizedEmail,
        status: "PENDING",
      },
    });

    // Generate cryptographic 256-bit secure token
    token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    createdInvitation = await prisma.organizationInvitation.create({
      data: {
        organizationId,
        email: normalizedEmail,
        roleId: role.id,
        token,
        status: "PENDING",
        expiresAt,
        inviterId,
      },
      include: {
        role: true,
      },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
    name: existingUser?.name || normalizedEmail.split("@")[0] || "Invited User",
    email: createdInvitation.email,
    mobile: existingUser?.mobile ?? null,
    image: existingUser?.image ?? null,
    status: (existingOrg?.status as MemberListItemDto["status"]) ?? "INVITED",
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
 * Updates a member's status (ACTIVE, SUSPENDED, REVOKED) with Last-Admin Safeguard and Session Termination
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
            include: { role: true, branch: true },
          },
        },
      },
    },
  });

  if (!userOrg) {
    throw new NotFoundError("Organization membership record not found.");
  }

  const currentRole = userOrg.user.branchRoles.find((br) => br.branchId === null)?.role ?? userOrg.user.branchRoles[0]?.role;
  const isCurrentAdmin = currentRole ? isAdministrativeRole(currentRole) : false;

  // Primary Owner Immunity Safeguard: The creator who signed up for this organization cannot be suspended
  if (input.status === "SUSPENDED") {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { metadata: true },
    });
    const earliestUo = await prisma.userOrganization.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    const orgMetadata =
      org?.metadata && typeof org.metadata === "object"
        ? (org.metadata as { creatorUserId?: string })
        : null;
    const creatorUserId =
      orgMetadata?.creatorUserId ?? earliestUo?.userId;

    if (creatorUserId && userOrg.userId === creatorUserId) {
      throw new SafeguardViolationError(
        "Cannot suspend the primary organization owner."
      );
    }
  }

  // Last-Admin Safeguard: Cannot suspend the last administrator
  if (isCurrentAdmin && input.status === "SUSPENDED") {
    const otherActiveAdminsCount = await prisma.userOrganization.count({
      where: {
        organizationId,
        status: "ACTIVE",
        id: { not: userOrg.id },
        user: {
          branchRoles: {
            some: {
              organizationId,
              role: {
                OR: [{ slug: "tenant-owner" }, { slug: "owner" }, { slug: "admin" }],
              },
            },
          },
        },
      },
    });

    if (otherActiveAdminsCount === 0) {
      throw new SafeguardViolationError(
        "Cannot suspend the last remaining organization administrator."
      );
    }
  }

  // Update status
  const updatedUserOrg = await prisma.userOrganization.update({
    where: { id: userOrg.id },
    data: { status: input.status },
  });

  // Enterprise Immediate Session Termination & Invitation Revocation: Revoke all active sessions and pending invites on suspension
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
 * Permanently removes a member from the workspace (hard-delete of membership and branch roles)
 */
export async function removeMember(
  organizationId: string,
  memberId: string
): Promise<{ success: boolean; message: string }> {
  // 1. Check if memberId corresponds to a UserOrganization record
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
            include: { role: true },
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

  // Primary Owner Immunity Safeguard: The creator who signed up for this organization cannot be removed
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });
  const earliestUo = await prisma.userOrganization.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  const orgMetadata =
    org?.metadata && typeof org.metadata === "object"
      ? (org.metadata as { creatorUserId?: string })
      : null;
  const creatorUserId =
    orgMetadata?.creatorUserId ?? earliestUo?.userId;

  if (creatorUserId && userOrg.userId === creatorUserId) {
    throw new SafeguardViolationError(
      "The primary organization owner cannot be removed from the organization."
    );
  }

  // Last-Admin Safeguard: Cannot remove the last administrator
  const currentRole =
    userOrg.user.branchRoles.find((br) => br.branchId === null)?.role ??
    userOrg.user.branchRoles[0]?.role;
  const isCurrentAdmin = currentRole ? isAdministrativeRole(currentRole) : false;

  if (isCurrentAdmin) {
    const otherActiveAdminsCount = await prisma.userOrganization.count({
      where: {
        organizationId,
        status: "ACTIVE",
        id: { not: userOrg.id },
        user: {
          branchRoles: {
            some: {
              organizationId,
              role: {
                OR: [{ slug: "tenant-owner" }, { slug: "owner" }, { slug: "admin" }],
              },
            },
          },
        },
      },
    });

    if (otherActiveAdminsCount === 0) {
      throw new SafeguardViolationError(
        "Cannot remove the last remaining organization administrator."
      );
    }
  }

  // Execute Hard Delete in a transaction:
  await prisma.$transaction([
    // Delete branch roles in this org
    prisma.userBranchRole.deleteMany({
      where: {
        userId: userOrg.userId,
        organizationId,
      },
    }),
    // Delete pending invitations for this email in this org
    prisma.organizationInvitation.deleteMany({
      where: {
        organizationId,
        email: userOrg.user.email.toLowerCase(),
      },
    }),
    // Invalidate active sessions in this org
    prisma.session.deleteMany({
      where: {
        userId: userOrg.userId,
        activeOrganizationId: organizationId,
      },
    }),
    // Delete the UserOrganization membership record
    prisma.userOrganization.delete({
      where: {
        id: userOrg.id,
      },
    }),
  ]);

  return { success: true, message: `Member ${userOrg.user.email} removed from organization.` };
}

/**
 * Updates a member's profile details, role, and branch assignment with Last-Admin Safeguard
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
            include: { role: true, branch: true },
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
    });

    if (!roleCandidate) {
      throw new NotFoundError("Selected new role was not found.");
    }

    newRole = roleCandidate;
    const isTargetAdmin = isAdministrativeRole(newRole);

    // Last-Admin Safeguard: Cannot demote the last administrator
    if (isCurrentAdmin && !isTargetAdmin) {
      const otherActiveAdminsCount = await prisma.userOrganization.count({
        where: {
          organizationId,
          status: "ACTIVE",
          id: { not: userOrg.id },
          user: {
            branchRoles: {
              some: {
                organizationId,
                role: {
                  OR: [{ slug: "tenant-owner" }, { slug: "owner" }, { slug: "admin" }],
                },
              },
            },
          },
        },
      });

      if (otherActiveAdminsCount === 0) {
        throw new SafeguardViolationError(
          "Cannot demote the last remaining organization administrator."
        );
      }
    }
  }

  // Hash new PIN if provided
  const pinHash = input.managerPin ? await hashPin(input.managerPin) : null;

  // Execute updates in transaction
  await prisma.$transaction(async (tx) => {
    // 1. Update user profile details
    const userUpdateData: { name?: string; mobile?: string | null; managerPinHash?: string | null } = {};
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

    // 2. Update terminalPinHash on userOrg if PIN changed
    if (pinHash) {
      await tx.userOrganization.update({
        where: { id: userOrg.id },
        data: { terminalPinHash: pinHash },
      });
    }

    // 3. Upsert branch role assignments if roleId(s) or branchId(s) were provided
    const targetRoleIds =
      input.roleIds && input.roleIds.length > 0
        ? input.roleIds
        : input.roleId
        ? [input.roleId]
        : null;

    const targetBranchIds =
      input.branchIds !== undefined
        ? input.branchIds
        : input.branchId !== undefined
        ? input.branchId
          ? [input.branchId]
          : []
        : null;

    if (targetRoleIds !== null || targetBranchIds !== null) {
      const finalRoleIds =
        targetRoleIds ??
        (newRole?.id
          ? [newRole.id]
          : currentRole?.id
          ? [currentRole.id]
          : []);
      const finalBranchIds = targetBranchIds ?? [];

      if (finalRoleIds.length > 0) {
        await tx.userBranchRole.deleteMany({
          where: {
            userId: userOrg.userId,
            organizationId,
          },
        });

        for (const rId of finalRoleIds) {
          if (finalBranchIds.length === 0) {
            await tx.userBranchRole.create({
              data: {
                userId: userOrg.userId,
                organizationId,
                roleId: rId,
                branchId: null,
              },
            });
          } else {
            for (const bId of finalBranchIds) {
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
    }
  });

  const latestMembers = await listOrganizationMembers(organizationId);
  const updatedDto = latestMembers.find((m) => m.id === userOrg.id);
  if (updatedDto) {
    return updatedDto;
  }

  // Fallback if record not found
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
    roleIds: [newRole?.id ?? ""],
    roleNames: [newRole?.name ?? "Team Member"],
    branchId: null,
    branchName: "All Branches",
    branchIds: [],
    branchNames: ["All Branches"],
    isInvitation: false,
    invitationToken: null,
    expiresAt: null,
    createdAt: userOrg.createdAt,
  };
}

/**
 * Updates a member's role assignment with Last-Admin Safeguard (delegates to updateMemberDetails)
 */
export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  input: UpdateMemberRoleInput
): Promise<MemberListItemDto> {
  return updateMemberDetails(organizationId, memberId, input);
}

/**
 * Cancels a pending invitation
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

export interface CreateDirectMemberInput {
  name: string;
  email: string;
  mobile?: string | null;
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
  managerPin?: string | null;
}

export interface CreateDirectMemberResult {
  member: MemberListItemDto;
  inviteUrl: string;
}

/**
 * Directly pre-registers a staff member into the organization and issues an active invitation link for sharing.
 */
export async function createDirectMember(
  organizationId: string,
  input: CreateDirectMemberInput,
  inviterId?: string
): Promise<CreateDirectMemberResult> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const targetRoleIds =
    input.roleIds && input.roleIds.length > 0
      ? input.roleIds
      : input.roleId
      ? [input.roleId]
      : [];

  if (targetRoleIds.length === 0) {
    throw new NotFoundError("At least one assigned role is required.");
  }

  // 1. Verify primary role exists
  const role = await prisma.role.findFirst({
    where: {
      id: targetRoleIds[0],
      OR: [{ organizationId: null }, { organizationId }],
    },
  });

  if (!role) {
    throw new NotFoundError("Selected role was not found.");
  }

  // 2. Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      organizations: {
        where: { organizationId },
      },
    },
  });

  if (user && user.organizations.length > 0) {
    const existingOrg = user.organizations[0];
    if (existingOrg) {
      if (existingOrg.status === "ACTIVE") {
        throw new ConflictError("A user with this email address is already an active member of this organization.");
      }
      if (existingOrg.status === "INVITED") {
        throw new ConflictError("A user with this email address has already been invited. You can copy their invitation link or resend it from the members directory.");
      }
      if (existingOrg.status === "SUSPENDED") {
        throw new ConflictError("A member with this email address is currently suspended. You can reactivate them from the members directory.");
      }
      if (existingOrg.status === "REVOKED") {
        throw new ConflictError("A member with this email address was previously revoked. You can restore their access by reactivating them from the members directory.");
      }
      throw new ConflictError("A member with this email address already belongs to this organization.");
    }
  }

  // Also check if an active pending invitation exists for this email address
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
      include: {
        organizations: true,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name.trim() || user.name,
        mobile: input.mobile?.trim() || user.mobile,
        managerPinHash: pinHash || user.managerPinHash,
      },
      include: {
        organizations: true,
      },
    });
  }

  const targetBranchIds =
    input.branchIds && input.branchIds.length > 0
      ? input.branchIds
      : input.branchId
      ? [input.branchId]
      : [];

  // 4. Upsert UserOrganization & UserBranchRole in transaction
  const userOrg = await prisma.$transaction(async (tx) => {
    const uo = await tx.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
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
      where: {
        userId: user.id,
        organizationId,
      },
    });

    for (const rId of targetRoleIds) {
      if (targetBranchIds.length === 0) {
        await tx.userBranchRole.create({
          data: {
            userId: user.id,
            organizationId,
            roleId: rId,
            branchId: null,
          },
        });
      } else {
        for (const bId of targetBranchIds) {
          await tx.userBranchRole.create({
            data: {
              userId: user.id,
              organizationId,
              roleId: rId,
              branchId: bId,
            },
          });
        }
      }
    }

    return uo;
  });

  // 5. Generate secure cryptographic invitation link for direct share
  await prisma.organizationInvitation.deleteMany({
    where: {
      organizationId,
      email: normalizedEmail,
      status: "PENDING",
    },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let effectiveInviterId = inviterId;
  if (!effectiveInviterId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { metadata: true },
    });
    interface OrgMetadataRecord {
      creatorUserId?: string;
    }
    const orgMetadata =
      org?.metadata && typeof org.metadata === "object"
        ? (org.metadata as OrgMetadataRecord)
        : null;
    if (orgMetadata?.creatorUserId) {
      effectiveInviterId = orgMetadata.creatorUserId;
    } else {
      const firstAdmin = await prisma.userOrganization.findFirst({
        where: { organizationId, status: "ACTIVE" },
        select: { userId: true },
      });
      effectiveInviterId = firstAdmin?.userId ?? user.id;
    }
  }

  const createdInvitation = await prisma.organizationInvitation.create({
    data: {
      organizationId,
      email: normalizedEmail,
      roleId: role.id,
      token,
      status: "PENDING",
      expiresAt,
      inviterId: effectiveInviterId,
    },
    include: {
      role: true,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${token}`;

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

