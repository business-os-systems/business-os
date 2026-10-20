import { prisma } from "@suite/db";
import type {
  MemberListItemDto,
  RoleOptionDto,
  RoleRecord,
  BranchRecord,
  AssignedEntities,
  PendingInviteRecord,
} from "./types";
import { isAdministrativeRole } from "./safeguards";

function resolveMemberRoleIds(
  distinctRoles: RoleRecord[],
  primaryRole?: RoleRecord | null,
  inviteRole?: RoleRecord | null
): string[] {
  if (distinctRoles.length > 0) return distinctRoles.map((r) => r.id);
  if (primaryRole) return [primaryRole.id];
  if (inviteRole) return [inviteRole.id];
  return [];
}

function resolveMemberRoleNames(
  distinctRoles: RoleRecord[],
  primaryRole?: RoleRecord | null,
  inviteRole?: RoleRecord | null
): string[] {
  if (distinctRoles.length > 0) return distinctRoles.map((r) => r.name);
  if (primaryRole) return [primaryRole.name];
  if (inviteRole) return [inviteRole.name];
  return ["Team Member"];
}

function resolveBranchAssignments(
  hasAllBranches: boolean,
  distinctBranches: BranchRecord[]
): { branchIds: string[]; branchNames: string[] } {
  if (hasAllBranches || distinctBranches.length === 0) {
    return { branchIds: [], branchNames: ["All Branches"] };
  }
  return {
    branchIds: distinctBranches.map((b) => b.id),
    branchNames: distinctBranches.map((b) => b.name),
  };
}

function resolveMemberStatus(
  status: string,
  isPrimaryOwner: boolean,
  hasPasswordAccount: boolean
): MemberListItemDto["status"] {
  if (status === "SUSPENDED") return "SUSPENDED";
  if (!isPrimaryOwner && (!hasPasswordAccount || status === "INVITED")) return "INVITED";
  return "ACTIVE";
}

function resolveDisplayName(name?: string | null, email?: string): string {
  if (name?.trim()) return name.trim();
  if (email) {
    const localPart = email.split("@")[0];
    if (localPart) return localPart;
  }
  return "Team Member";
}

function extractAssignedEntities(
  branchRoles: Array<{
    role?: RoleRecord | null;
    branchId?: string | null;
    branch?: BranchRecord | null;
  }>
): AssignedEntities {
  const roleMap = new Map<string, RoleRecord>();
  const branchMap = new Map<string, BranchRecord>();
  let hasAllBranches = false;

  for (const br of branchRoles) {
    if (br.role) {
      roleMap.set(br.role.id, {
        id: br.role.id,
        name: br.role.name,
        slug: br.role.slug,
        permissions: br.role.permissions,
      });
    }
    if (br.branchId === null || br.branchId === "") {
      hasAllBranches = true;
    } else if (br.branch) {
      branchMap.set(br.branch.id, { id: br.branch.id, name: br.branch.name });
    }
  }

  return {
    distinctRoles: Array.from(roleMap.values()),
    distinctBranches: Array.from(branchMap.values()),
    hasAllBranches,
  };
}

function filterExternalPendingInvites<T extends { email: string }>(
  pendingInvites: T[],
  existingEmails: Set<string>
): T[] {
  const seenInviteEmails = new Set<string>();
  return pendingInvites.filter((inv) => {
    const emailKey = inv.email.toLowerCase();
    if (existingEmails.has(emailKey) || seenInviteEmails.has(emailKey)) return false;
    seenInviteEmails.add(emailKey);
    return true;
  });
}

function findEarliestUserId(
  userOrgs: Array<{ userId: string; createdAt: Date }>
): string | undefined {
  if (userOrgs.length === 0) return undefined;
  let earliest = userOrgs[0]!;
  for (const curr of userOrgs) {
    if (curr.createdAt < earliest.createdAt) earliest = curr;
  }
  return earliest.userId;
}

function mapPendingInviteToMemberDto(inv: PendingInviteRecord): MemberListItemDto {
  const isOwner = inv.role ? isAdministrativeRole(inv.role) : false;
  return {
    id: inv.id,
    userId: null,
    name: resolveDisplayName(null, inv.email),
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

/**
 * Lists all active members and pending invitations for the specified organization.
 */
export async function listOrganizationMembers(
  organizationId: string
): Promise<MemberListItemDto[]> {
  const userOrgs =
    (await prisma.userOrganization.findMany({
      where: { organizationId, status: { not: "REVOKED" } },
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
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
                branch: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })) ?? [];

  const pendingInvites =
    (await prisma.organizationInvitation.findMany({
      where: { organizationId, status: "PENDING" },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })) ?? [];

  const pendingByEmail = new Map(
    pendingInvites.map((inv) => [inv.email.toLowerCase(), inv])
  );

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  });

  const orgMetadata = org?.metadata as { creatorUserId?: string } | null;
  const creatorUserId = orgMetadata?.creatorUserId ?? findEarliestUserId(userOrgs);

  const activeMembers: MemberListItemDto[] = userOrgs.map((uo) => {
    const branchRoles = uo.user.branchRoles;
    const { distinctRoles, distinctBranches, hasAllBranches } =
      extractAssignedEntities(branchRoles);

    const globalRole =
      branchRoles.find((br) => br.branchId === null) ?? branchRoles[0];
    const role = globalRole?.role;
    const branch = globalRole?.branch;

    const isPrimaryOwner = Boolean(creatorUserId && uo.userId === creatorUserId);
    const isOwner = isPrimaryOwner || (role ? isAdministrativeRole(role) : false);
    const matchedInvite = pendingByEmail.get(uo.user.email.toLowerCase());

    const roleIds = resolveMemberRoleIds(distinctRoles, role, matchedInvite?.role);
    const roleNames = resolveMemberRoleNames(distinctRoles, role, matchedInvite?.role);
    const { branchIds, branchNames } = resolveBranchAssignments(
      hasAllBranches,
      distinctBranches
    );

    const hasPassword = Boolean(uo.user.accounts && uo.user.accounts.length > 0);
    const memberStatus = resolveMemberStatus(uo.status, isPrimaryOwner, hasPassword);

    return {
      id: uo.id,
      userId: uo.userId,
      name: resolveDisplayName(uo.user.name, uo.user.email),
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

  const existingEmails = new Set(activeMembers.map((m) => m.email.toLowerCase()));
  const externalPendingInvites = filterExternalPendingInvites(
    pendingInvites,
    existingEmails
  );
  const invitedMembers = externalPendingInvites.map(mapPendingInviteToMemberDto);

  return [...activeMembers, ...invitedMembers];
}

/**
 * Lists dynamic and system roles available to the organization.
 */
export async function listOrganizationRoles(
  organizationId: string
): Promise<RoleOptionDto[]> {
  const roles = await prisma.role.findMany({
    where: {
      OR: [{ organizationId }, { organizationId: null, isSystem: true }],
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
