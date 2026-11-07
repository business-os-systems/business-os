import { NextRequest, NextResponse } from "next/server";
import { assertTenantWriteQuotaAvailable, prisma, type Prisma } from "@suite/db";
import { PLATFORM_ERROR_CODE, QUOTA_KEYS } from "@suite/core";
import { QuotaExceededError } from "@suite/core/errors";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  hashPassword,
  hashToken,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import { z } from "zod";

const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .optional(),
  name: z.string().trim().min(2, "Full name must be at least 2 characters").optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Bad Request",
        detail: "Invitation token parameter is required.",
      });
    }

    const hashedToken = hashToken(token);
    let invitation = await prisma.organizationInvitation.findUnique({
      where: { token: hashedToken },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        role: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Backward-compatible fallback for legacy unhashed tokens
    if (!invitation) {
      invitation = await prisma.organizationInvitation.findUnique({
        where: { token },
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
          role: {
            select: { id: true, name: true, slug: true },
          },
        },
      });
    }

    if (!invitation) {
      return problemResponse({
        status: 404,
        code: "INVITATION_NOT_FOUND",
        title: "Not Found",
        detail: "Invitation not found or has already been consumed.",
      });
    }

    if (invitation.status !== "PENDING") {
      if (invitation.status === "ACCEPTED") {
        return problemResponse({
          status: 409,
          code: "INVITATION_ACCEPTED",
          title: "Invitation Already Accepted",
          detail: "This invitation has already been accepted. You can log in directly to access your workspace.",
          extra: { isAccepted: true },
        });
      }
      return problemResponse({
        status: 409,
        code: "INVITATION_INACTIVE",
        title: "Conflict",
        detail: `Invitation is no longer active (status: ${invitation.status}).`,
      });
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return problemResponse({
        status: 410,
        code: "INVITATION_EXPIRED",
        title: "Gone",
        detail: "This invitation link has expired. Please request a new invitation from your administrator.",
      });
    }

    // Check if user is already registered in DB and verify not suspended/revoked
    const user = await prisma.user.findUnique({
      where: { email: invitation.email.toLowerCase() },
      include: {
        accounts: {
          where: { providerId: "credential" },
        },
        organizations: {
          where: { organizationId: invitation.organizationId },
        },
      },
    });

    if (user?.organizations?.[0]) {
      const userOrg = user.organizations[0];
      if (userOrg.status === "SUSPENDED" || userOrg.status === "REVOKED") {
        return problemResponse({
          status: 403,
          code: "INVITATION_REVOKED",
          title: "Access Revoked",
          detail: "Your workspace access has been suspended or revoked. Contact your organization administrator.",
        });
      }
    }

    let branchName = "All Branches";
    if (user) {
      const branchRole = await prisma.userBranchRole.findFirst({
        where: { userId: user.id, organizationId: invitation.organizationId },
        include: { branch: { select: { name: true } } },
      });
      if (branchRole?.branch?.name) {
        branchName = branchRole.branch.name;
      }
    }

    return successResponse({
      isValid: true,
      token: invitation.token,
      email: invitation.email,
      name: user?.name || null,
      organizationName: invitation.organization.name,
      roleName: invitation.role.name,
      branchName,
      hasPassword: Boolean(user?.accounts && user.accounts.length > 0),
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("Error fetching invitation details:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to resolve invitation details.",
    });
  }
}

interface CompleteInvitationAcceptanceInput {
  readonly tx: Prisma.TransactionClient;
  readonly invitationId: string;
  readonly organizationId: string;
  readonly targetUserId: string;
}

async function completeInvitationAcceptance(
  options: CompleteInvitationAcceptanceInput
): Promise<void> {
  const { tx, invitationId, organizationId, targetUserId } = options;

  await tx.organizationInvitation.update({
    where: { id: invitationId },
    data: { status: "ACCEPTED" },
  });

  const dbUser = await tx.user.findUnique({
    where: { id: targetUserId },
    select: { metadata: true },
  });
  const meta = (dbUser?.metadata || {}) as Record<string, unknown>;

  await tx.user.update({
    where: { id: targetUserId },
    data: {
      metadata: {
        ...meta,
        onboarding_status: "COMPLETED",
        current_onboarding_step: null,
        active_organization_id: organizationId,
      },
    },
  });
}

interface AssertMembershipSeatInput {
  readonly tx: Prisma.TransactionClient;
  readonly organizationId: string;
  readonly hasExistingMembership: boolean;
}

async function assertMembershipSeatAvailable(
  options: AssertMembershipSeatInput
): Promise<void> {
  const { tx, organizationId, hasExistingMembership } = options;
  if (hasExistingMembership) {
    return;
  }
  await assertTenantWriteQuotaAvailable(tx, {
    organizationId,
    resourceKey: QUOTA_KEYS.MEMBERS,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const parseResult = acceptInvitationSchema.safeParse(body);

    if (!parseResult.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Bad Request",
        detail: parseResult.error.errors[0]?.message || "Invalid invitation input.",
        extra: {
          errors: parseResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
      });
    }

    const { token, password, name } = parseResult.data;

    const hashedToken = hashToken(token);
    let invitation = await prisma.organizationInvitation.findUnique({
      where: { token: hashedToken },
      include: {
        organization: true,
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

    // Backward-compatible fallback for legacy unhashed tokens
    if (!invitation) {
      invitation = await prisma.organizationInvitation.findUnique({
        where: { token },
        include: {
          organization: true,
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
    }

    if (!invitation) {
      return problemResponse({
        status: 404,
        code: "INVITATION_NOT_FOUND",
        title: "Not Found",
        detail: "Invitation not found or has already been consumed.",
      });
    }

    if (invitation.status !== "PENDING") {
      if (invitation.status === "ACCEPTED") {
        return problemResponse({
          status: 409,
          code: "INVITATION_ACCEPTED",
          title: "Invitation Already Accepted",
          detail: "This invitation link has already been used and expired. Please sign in directly.",
          extra: { isAccepted: true },
        });
      }

      return problemResponse({
        status: 409,
        code: "INVITATION_INACTIVE",
        title: "Conflict",
        detail: `Invitation is no longer active (status: ${invitation.status}).`,
      });
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return problemResponse({
        status: 410,
        code: "INVITATION_EXPIRED",
        title: "Gone",
        detail: "This invitation link has expired. Please request a new invitation.",
      });
    }

    const normalizedEmail = (invitation.email || "").toLowerCase().trim();

    // Verify target user is not suspended or revoked in this organization
    const existingUserOrg = prisma.userOrganization?.findFirst
      ? await prisma.userOrganization.findFirst({
          where: {
            user: { email: normalizedEmail },
            organizationId: invitation.organizationId,
          },
        })
      : null;

    if (existingUserOrg && (existingUserOrg.status === "SUSPENDED" || existingUserOrg.status === "REVOKED")) {
      return problemResponse({
        status: 403,
        code: "INVITATION_REVOKED",
        title: "Access Revoked",
        detail: "Your workspace access has been suspended or revoked. Contact your organization administrator.",
      });
    }

    // Determine target user (either existing authenticated session or newly registered/authenticated via password)
    const sessionResult = await getAuthenticatedSession(request);
    let targetUserId: string;
    let targetEmail: string;
    let targetName: string;

    if (sessionResult.ok) {
      // Issue 27: Invitation account hijacking prevention
      const sessionEmail = sessionResult.session.email.toLowerCase().trim();
      if (sessionEmail !== normalizedEmail) {
        return problemResponse({
          status: 403,
          code: "INVITATION_EMAIL_MISMATCH",
          title: "Forbidden",
          detail: `This invitation was issued to ${invitation.email}. You are currently signed in as ${sessionResult.session.email}. Please sign in to the matching account or accept in a private window.`,
        });
      }

      targetUserId = sessionResult.session.userId;
      targetEmail = sessionResult.session.email;
      targetName = sessionResult.session.userName;
    } else {
      // User is not signed in: password is required to establish credentials
      if (!password) {
        return problemResponse({
          status: 422,
          code: "PASSWORD_REQUIRED",
          title: "Password Required",
          detail: "A password is required to set up your account and join the workspace.",
        });
      }

      const hashedPassword = await hashPassword(password);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      const effectiveName = name?.trim() || user?.name || normalizedEmail.split("@")[0] || "Team Member";

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: effectiveName,
            emailVerified: true,
          },
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: name?.trim() || user.name,
            emailVerified: true,
          },
        });
      }

      // Upsert credential Account
      await prisma.account.upsert({
        where: {
          providerId_accountId: {
            providerId: "credential",
            accountId: normalizedEmail,
          },
        },
        create: {
          userId: user.id,
          providerId: "credential",
          accountId: normalizedEmail,
          password: hashedPassword,
        },
        update: {
          password: hashedPassword,
        },
      });

      targetUserId = user.id;
      targetEmail = user.email;
      targetName = user.name;
    }

    let assignedBranchId: string | null = null;

    // Fast-Track Membership Enrollment in transaction
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // A pending invitation is not a membership row, so acceptance is the
      // member-creation write point. An existing non-revoked member already
      // occupies a seat and is not a new write.
      await assertMembershipSeatAvailable({
        tx,
        organizationId: invitation.organizationId,
        hasExistingMembership: Boolean(existingUserOrg),
      });

      // 1. Link UserOrganization
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: targetUserId,
          organizationId: invitation.organizationId,
          status: "ACTIVE",
        },
        update: {
          status: "ACTIVE",
        },
      });

      // 2. Link UserBranchRole
      const existingBranchRole = await tx.userBranchRole.findFirst({
        where: {
          userId: targetUserId,
          organizationId: invitation.organizationId,
        },
      });
      assignedBranchId = existingBranchRole?.branchId || null;

      await tx.userBranchRole.deleteMany({
        where: {
          userId: targetUserId,
          organizationId: invitation.organizationId,
        },
      });

      await tx.userBranchRole.create({
        data: {
          userId: targetUserId,
          organizationId: invitation.organizationId,
          branchId: assignedBranchId,
          roleId: invitation.roleId,
        },
      });

      // 3-4. Mark the invitation accepted and finish onboarding atomically.
      await completeInvitationAcceptance({
        tx,
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        targetUserId,
      });
    });

    const userPermissions =
      invitation.role?.permissions
        ?.map((rp: { permission?: { action: string } | null }) => rp.permission?.action)
        .filter(Boolean) as string[] || [];

    // Issue updated session token
    const updatedPayload = encodeSessionPayload({
      userId: targetUserId,
      email: targetEmail,
      userName: targetName,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      role: invitation.role.slug || "member",
      activeBranchId: assignedBranchId || undefined,
      permissions: userPermissions,
      themePreference: "system",
      timestamp: Date.now(),
      onboardingStatus: "COMPLETED",
      currentOnboardingStep: null,
    });

    const tokenJwt = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = NextResponse.json({
      success: true,
      message: `Successfully joined ${invitation.organization.name}`,
      redirectUrl: "/dashboard",
    });

    response.cookies.set({
      name: cookieOptions.name,
      value: tokenJwt,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      // The invitee is not yet a member; do not disclose seat limits or
      // consumption to an unauthenticated holder of an invitation token.
      return problemResponse({
        status: 409,
        code: PLATFORM_ERROR_CODE.QUOTA_EXCEEDED,
        title: "Workspace Member Limit Reached",
        detail:
          "This workspace cannot accept another member right now. Contact the workspace administrator.",
      });
    }

    console.error("Error accepting invitation:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to accept organization invitation.",
    });
  }
}
