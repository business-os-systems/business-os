import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  hashPassword,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { z } from "zod";

const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
  name: z.string().trim().min(2, "Full name must be at least 2 characters").optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: "Invitation token parameter is required.",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const invitation = await prisma.organizationInvitation.findUnique({
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

    if (!invitation) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Invitation not found or has already been consumed.",
          code: "INVITATION_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (invitation.status !== "PENDING") {
      if (invitation.status === "ACCEPTED") {
        return NextResponse.json(
          {
            type: "/errors/invitation-accepted",
            title: "Invitation Already Accepted",
            status: 409,
            detail: "This invitation has already been accepted. You can log in directly to access your workspace.",
            code: "INVITATION_ACCEPTED",
            isAccepted: true,
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } }
        );
      }
      return NextResponse.json(
        {
          type: "/errors/invitation-invalid",
          title: "Conflict",
          status: 409,
          detail: `Invitation is no longer active (status: ${invitation.status}).`,
          code: "INVITATION_INACTIVE",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json(
        {
          type: "/errors/invitation-expired",
          title: "Gone",
          status: 410,
          detail: "This invitation link has expired. Please request a new invitation from your administrator.",
          code: "INVITATION_EXPIRED",
        },
        { status: 410, headers: { "Content-Type": "application/problem+json" } }
      );
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
        return NextResponse.json(
          {
            type: "/errors/forbidden",
            title: "Access Revoked",
            status: 403,
            detail: "Your workspace access has been suspended or revoked. Contact your organization administrator.",
            code: "INVITATION_REVOKED",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } }
        );
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

    return NextResponse.json({
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
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Failed to resolve invitation details.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const parseResult = acceptInvitationSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.errors[0]?.message || "Invalid invitation input.",
          errors: parseResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { token, password, name } = parseResult.data;

    const invitation = await prisma.organizationInvitation.findUnique({
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

    if (!invitation) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Invitation not found or has already been consumed.",
          code: "INVITATION_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (invitation.status !== "PENDING") {
      if (invitation.status === "ACCEPTED") {
        return NextResponse.json(
          {
            type: "/errors/invitation-accepted",
            title: "Invitation Already Accepted",
            status: 409,
            detail: "This invitation link has already been used and expired. Please sign in directly.",
            code: "INVITATION_ACCEPTED",
            isAccepted: true,
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      return NextResponse.json(
        {
          type: "/errors/invitation-invalid",
          title: "Conflict",
          status: 409,
          detail: `Invitation is no longer active (status: ${invitation.status}).`,
          code: "INVITATION_INACTIVE",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json(
        {
          type: "/errors/invitation-expired",
          title: "Gone",
          status: 410,
          detail: "This invitation link has expired. Please request a new invitation.",
          code: "INVITATION_EXPIRED",
        },
        { status: 410, headers: { "Content-Type": "application/problem+json" } }
      );
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
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Revoked",
          status: 403,
          detail: "Your workspace access has been suspended or revoked. Contact your organization administrator.",
          code: "INVITATION_REVOKED",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Determine target user (either existing authenticated session or newly registered/authenticated via password)
    const sessionResult = await getAuthenticatedSession(request);
    let targetUserId: string;
    let targetEmail: string;
    let targetName: string;

    if (sessionResult.ok) {
      targetUserId = sessionResult.session.userId;
      targetEmail = sessionResult.session.email;
      targetName = sessionResult.session.userName;
    } else {
      // User is not signed in: password is required to establish credentials
      if (!password) {
        return NextResponse.json(
          {
            type: "/errors/validation-error",
            title: "Password Required",
            status: 422,
            detail: "A password is required to set up your account and join the workspace.",
            code: "PASSWORD_REQUIRED",
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } }
        );
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
    await prisma.$transaction(async (tx) => {
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

      // 3. Mark invitation ACCEPTED
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });

      // 4. Update user onboarding status to COMPLETED immediately
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
            active_organization_id: invitation.organizationId,
          },
        },
      });
    });

    const userPermissions =
      invitation.role?.permissions
        ?.map((rp) => rp.permission?.action)
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
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Failed to accept organization invitation.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
