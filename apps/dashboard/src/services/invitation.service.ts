import { assertTenantWriteQuotaAvailable, prisma, type Prisma } from "@suite/db";
import { ONBOARDING_STATUS, hashPassword, hashToken } from "@suite/auth";
import { QUOTA_KEYS } from "@suite/core";

const INVITATION_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
} as const;

const MEMBERSHIP_BLOCKED_STATUSES = ["SUSPENDED", "REVOKED"] as const;
const DEFAULT_BRANCH_NAME = "All Branches";

export interface InvitationDetailsDto {
  readonly token: string;
  readonly email: string;
  readonly name: string | null;
  readonly organizationName: string;
  readonly roleName: string;
  readonly branchName: string;
  readonly hasPassword: boolean;
  readonly expiresAt: Date;
}

export type InvitationDetailsResult =
  | { readonly status: "not_found" }
  | { readonly status: "already_accepted" }
  | { readonly status: "inactive"; readonly invitationStatus: string }
  | { readonly status: "expired" }
  | { readonly status: "revoked" }
  | { readonly status: "valid"; readonly details: InvitationDetailsDto };

export interface AuthenticatedInvitationSession {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
}

export type AcceptInvitationResult =
  | { readonly status: "not_found" }
  | { readonly status: "already_accepted" }
  | { readonly status: "inactive"; readonly invitationStatus: string }
  | { readonly status: "expired" }
  | { readonly status: "revoked" }
  | { readonly status: "password_required" }
  | { readonly status: "email_mismatch"; readonly invitationEmail: string; readonly sessionEmail: string }
  | {
      readonly status: "accepted";
      readonly organizationId: string;
      readonly organizationName: string;
      readonly userId: string;
      readonly userEmail: string;
      readonly userName: string;
      readonly roleSlug: string;
      readonly permissions: string[];
      readonly assignedBranchId?: string;
    };

function findInvitationForDetails(token: string) {
  return prisma.organizationInvitation.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      role: { select: { id: true, name: true, slug: true } },
    },
  });
}

function findInvitationForAcceptance(token: string) {
  return prisma.organizationInvitation.findUnique({
    where: { token },
    include: {
      organization: true,
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
}

async function findInvitationByToken<T>(
  rawToken: string,
  finder: (token: string) => Promise<T | null>
): Promise<T | null> {
  const hashed = await finder(hashToken(rawToken));
  if (hashed) {
    return hashed;
  }
  // Legacy rows stored the raw token before hashing was introduced.
  return finder(rawToken);
}

function isInvitationExpired(expiresAt: Date): boolean {
  return expiresAt < new Date();
}

function collectRolePermissions(role: {
  readonly permissions: readonly { readonly permission: { readonly action: string } | null }[];
} | null): string[] {
  if (!role) {
    return [];
  }
  return role.permissions
    .map((entry) => entry.permission?.action)
    .filter((action): action is string => typeof action === "string");
}

export async function getInvitationDetails(token: string): Promise<InvitationDetailsResult> {
  const invitation = await findInvitationByToken(token, findInvitationForDetails);
  if (!invitation) {
    return { status: "not_found" };
  }
  const block = resolveInvitationBlock(invitation);
  if (block) {
    return block;
  }

  const user = await prisma.user.findUnique({
    where: { email: invitation.email.toLowerCase() },
    include: {
      accounts: { where: { providerId: "credential" } },
      organizations: { where: { organizationId: invitation.organizationId } },
    },
  });

  if (isBlockedMembershipStatus(readMembershipStatus(user))) {
    return { status: "revoked" };
  }

  const branchName = await resolveBranchName(user?.id, invitation.organizationId);
  return {
    status: "valid",
    details: {
      token: invitation.token,
      email: invitation.email,
      name: readInvitedUserName(user),
      organizationName: invitation.organization.name,
      roleName: invitation.role.name,
      branchName,
      hasPassword: hasCredentialPassword(user),
      expiresAt: invitation.expiresAt,
    },
  };
}

function readMembershipStatus(
  user: { readonly organizations?: readonly { readonly status: string }[] } | null
): string | undefined {
  return user?.organizations?.[0]?.status;
}

function readInvitedUserName(user: { readonly name: string } | null): string | null {
  if (!user) {
    return null;
  }
  return user.name;
}

function hasCredentialPassword(user: { readonly accounts: readonly unknown[] } | null): boolean {
  if (!user) {
    return false;
  }
  return user.accounts.length > 0;
}

async function resolveBranchName(
  userId: string | undefined,
  organizationId: string
): Promise<string> {
  if (!userId) {
    return DEFAULT_BRANCH_NAME;
  }
  const branchRole = await prisma.userBranchRole.findFirst({
    where: { userId, organizationId },
    include: { branch: { select: { name: true } } },
  });
  return branchRole?.branch?.name ?? DEFAULT_BRANCH_NAME;
}

interface MembershipStatusFinder {
  findFirst(args: {
    where: { user: { email: string }; organizationId: string };
  }): Promise<{ readonly status: string } | null>;
}

function isMembershipStatusFinder(value: unknown): value is MembershipStatusFinder {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "findFirst" in value && typeof Reflect.get(value, "findFirst") === "function";
}

async function findExistingMembership(
  email: string,
  organizationId: string
): Promise<{ readonly status: string } | null> {
  const membershipDelegate: unknown = prisma.userOrganization;
  if (!isMembershipStatusFinder(membershipDelegate)) {
    return null;
  }
  return membershipDelegate.findFirst({ where: { user: { email }, organizationId } });
}

function isBlockedMembershipStatus(status: string | undefined): boolean {
  if (!status) {
    return false;
  }
  return MEMBERSHIP_BLOCKED_STATUSES.some((blocked) => blocked === status);
}

type InvitationBlock =
  | { readonly status: "already_accepted" }
  | { readonly status: "inactive"; readonly invitationStatus: string }
  | { readonly status: "expired" };

function resolveInvitationBlock(invitation: {
  readonly status: string;
  readonly expiresAt: Date;
}): InvitationBlock | null {
  if (invitation.status !== INVITATION_STATUS.PENDING) {
    if (invitation.status === INVITATION_STATUS.ACCEPTED) {
      return { status: "already_accepted" };
    }
    return { status: "inactive", invitationStatus: invitation.status };
  }
  if (isInvitationExpired(invitation.expiresAt)) {
    return { status: "expired" };
  }
  return null;
}

interface AcceptanceTarget {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
}

interface ResolveTargetInput {
  readonly invitation: {
    readonly email: string;
    readonly organizationId: string;
  };
  readonly session: AuthenticatedInvitationSession | null;
  readonly password?: string;
  readonly name?: string;
}

async function resolveAcceptanceTarget(
  input: ResolveTargetInput
): Promise<AcceptanceTarget | AcceptInvitationResult> {
  const normalizedEmail = input.invitation.email.toLowerCase().trim();

  if (input.session) {
    const sessionEmail = input.session.email.toLowerCase().trim();
    if (sessionEmail !== normalizedEmail) {
      return { status: "email_mismatch", invitationEmail: input.invitation.email, sessionEmail: input.session.email };
    }
    return {
      userId: input.session.userId,
      email: input.session.email,
      userName: input.session.userName,
    };
  }

  if (!input.password) {
    return { status: "password_required" };
  }
  return provisionCredentialTarget({
    email: normalizedEmail,
    password: input.password,
    name: input.name,
  });
}

async function provisionCredentialTarget(input: {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
}): Promise<AcceptanceTarget> {
  const hashedPassword = await hashPassword(input.password);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  const effectiveName = input.name?.trim() ?? existing?.name ?? input.email.split("@")[0] ?? "Team Member";

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name: input.name?.trim() ?? existing.name, emailVerified: true },
      })
    : await prisma.user.create({
        data: { email: input.email, name: effectiveName, emailVerified: true },
      });

  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: input.email,
      },
    },
    create: {
      userId: user.id,
      providerId: "credential",
      accountId: input.email,
      password: hashedPassword,
    },
    update: { password: hashedPassword },
  });

  return { userId: user.id, email: user.email, userName: user.name };
}

interface EnrollInput {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly targetUserId: string;
  readonly hasExistingMembership: boolean;
}

async function completeAcceptance(
  tx: Prisma.TransactionClient,
  input: EnrollInput
): Promise<void> {
  await tx.organizationInvitation.update({
    where: { id: input.invitationId },
    data: { status: INVITATION_STATUS.ACCEPTED },
  });

  const dbUser = await tx.user.findUnique({
    where: { id: input.targetUserId },
    select: { metadata: true },
  });
  const metadata = (dbUser?.metadata ?? {}) as Record<string, unknown>;

  await tx.user.update({
    where: { id: input.targetUserId },
    data: {
      metadata: {
        ...metadata,
        onboarding_status: ONBOARDING_STATUS.COMPLETED,
        current_onboarding_step: null,
        active_organization_id: input.organizationId,
      },
    },
  });
}

async function enrollMember(input: EnrollInput): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    if (!input.hasExistingMembership) {
      await assertTenantWriteQuotaAvailable(tx, {
        organizationId: input.organizationId,
        resourceKey: QUOTA_KEYS.MEMBERS,
      });
    }

    await tx.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: input.targetUserId,
          organizationId: input.organizationId,
        },
      },
      create: { userId: input.targetUserId, organizationId: input.organizationId, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });

    const existingBranchRole = await tx.userBranchRole.findFirst({
      where: { userId: input.targetUserId, organizationId: input.organizationId },
    });
    const assignedBranchId = existingBranchRole?.branchId ?? null;

    await tx.userBranchRole.deleteMany({
      where: { userId: input.targetUserId, organizationId: input.organizationId },
    });
    await tx.userBranchRole.create({
      data: {
        userId: input.targetUserId,
        organizationId: input.organizationId,
        branchId: assignedBranchId,
        roleId: input.roleId,
      },
    });

    await completeAcceptance(tx, input);
    return assignedBranchId;
  });
}

export interface AcceptInvitationInput {
  readonly token: string;
  readonly password?: string;
  readonly name?: string;
  readonly session: AuthenticatedInvitationSession | null;
}

export async function acceptInvitation(
  input: AcceptInvitationInput
): Promise<AcceptInvitationResult> {
  const invitation = await findInvitationByToken(input.token, findInvitationForAcceptance);
  if (!invitation) {
    return { status: "not_found" };
  }
  const block = resolveInvitationBlock(invitation);
  if (block) {
    return block;
  }

  const normalizedEmail = invitation.email.toLowerCase().trim();
  const existingMembership = await findExistingMembership(normalizedEmail, invitation.organizationId);
  if (existingMembership && isBlockedMembershipStatus(existingMembership.status)) {
    return { status: "revoked" };
  }

  const target = await resolveAcceptanceTarget({
    invitation,
    session: input.session,
    password: input.password,
    name: input.name,
  });
  if ("status" in target) {
    return target;
  }

  const assignedBranchId = await enrollMember({
    invitationId: invitation.id,
    organizationId: invitation.organizationId,
    roleId: invitation.roleId,
    targetUserId: target.userId,
    hasExistingMembership: Boolean(existingMembership),
  });

  return {
    status: "accepted",
    organizationId: invitation.organizationId,
    organizationName: invitation.organization.name,
    userId: target.userId,
    userEmail: target.email,
    userName: target.userName,
    roleSlug: invitation.role.slug,
    permissions: collectRolePermissions(invitation.role),
    assignedBranchId: assignedBranchId ?? undefined,
  };
}
