import type { PrismaClient } from "@suite/db";
import { NotFoundError, ValidationError } from "@suite/core/errors";

export interface ProvisionJitUserParams {
  email: string;
  name: string;
  ssoConnectionId: string;
  mobile?: string | null;
  image?: string | null;
  prisma: PrismaClient;
}

export interface JitProvisionedResult {
  user: {
    id: string;
    email: string;
    name: string;
  };
  organizationId: string;
  isNewUser: boolean;
  assignedRoleId: string | null;
}

/**
 * Executes enterprise Just-In-Time (JIT) account provisioning upon valid SSO IdP callback.
 * Automatically activates user identity, company tenancy, and default dynamic branch roles.
 */
export async function provisionJitSsoUser(
  params: ProvisionJitUserParams
): Promise<JitProvisionedResult> {
  const { email, name, ssoConnectionId, mobile, image, prisma } = params;

  if (!email || !email.includes("@")) {
    throw new ValidationError("Valid corporate email required for JIT provisioning", [
      { name: "email", reason: "Valid corporate email required" },
    ]);
  }

  // Verify SSO connection exists
  const ssoRecord = await prisma.ssoConnection.findUnique({
    where: { id: ssoConnectionId },
    include: { organization: true },
  });

  if (!ssoRecord) {
    throw new NotFoundError(`SSO Connection [${ssoConnectionId}] not found`, {
      code: "SSO_PROVIDER_NOT_FOUND",
    });
  }

  const organizationId = ssoRecord.organizationId;
  const normalizedEmail = email.trim().toLowerCase();

  // Find or create User
  let isNewUser = false;
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name || normalizedEmail.split("@")[0] || "Staff User",
        emailVerified: true,
        mobile: mobile || null,
        image: image || null,
      },
    });
    isNewUser = true;
  } else if (!user.emailVerified) {
    // Verified by enterprise IdP assertion
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  // Find or create UserOrganization tenant membership
  const existingUserOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId,
      },
    },
  });

  if (!existingUserOrg) {
    await prisma.userOrganization.create({
      data: {
        userId: user.id,
        organizationId,
        status: "ACTIVE",
      },
    });
  }

  // Provision default role if configured on the SSO connection
  let assignedRoleId: string | null = null;
  if (ssoRecord.defaultRoleId) {
    const role = await prisma.role.findUnique({
      where: { id: ssoRecord.defaultRoleId },
    });

    if (role) {
      const existingAssignment = await prisma.userBranchRole.findFirst({
        where: {
          userId: user.id,
          organizationId,
          roleId: role.id,
          branchId: null, // Organization-wide default assignment
        },
      });

      if (!existingAssignment) {
        await prisma.userBranchRole.create({
          data: {
            userId: user.id,
            organizationId,
            roleId: role.id,
            branchId: null,
          },
        });
      }
      assignedRoleId = role.id;
    }
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    organizationId,
    isNewUser,
    assignedRoleId,
  };
}
