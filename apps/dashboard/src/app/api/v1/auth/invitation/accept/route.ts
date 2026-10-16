import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
} from "@suite/auth/session";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { z } from "zod";

const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const session = sessionResult.session;


    const body = await request.json().catch(() => null);
    const parseResult = acceptInvitationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.errors[0]?.message || "Invalid invitation token",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { token } = parseResult.data;

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

    // Join organization and complete onboarding immediately (Invitation Fast-Track)
    await prisma.$transaction(async (tx) => {
      // 1. Link UserOrganization
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: {
            userId: session.userId,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: session.userId,
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
          userId: session.userId,
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
        },
      });

      if (!existingBranchRole) {
        await tx.userBranchRole.create({
          data: {
            userId: session.userId,
            organizationId: invitation.organizationId,
            branchId: null,
            roleId: invitation.roleId,
          },
        });
      }

      // 3. Mark invitation ACCEPTED
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });

      // 4. Update user onboarding status to COMPLETED immediately
      const dbUser = await tx.user.findUnique({
        where: { id: session.userId },
        select: { metadata: true },
      });
      const meta = (dbUser?.metadata || {}) as Record<string, unknown>;

      await tx.user.update({
        where: { id: session.userId },
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
      userId: session.userId,
      email: session.email,
      userName: session.userName,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      role: invitation.role.slug || "member",
      permissions: userPermissions,
      themePreference: session.themePreference || "system",
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
