import { prisma } from "@suite/db";
import {
  extractEffectivePermissions,
  recordSecurityAuditLog,
  type OnboardingStatus,
  type ThemePreference,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";
import { mapBranch, mapIdentity, mapOnboarding, mapOrganization } from "./session-mapper";

export interface PasskeyLoginContext {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
  readonly roleName: string;
  readonly roleSlug?: string;
  readonly permissions: string[];
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly activeBranchId?: string;
  readonly activeBranchName?: string;
  readonly onboardingStatus: OnboardingStatus;
  readonly currentOnboardingStep?: number;
  readonly themePreference: ThemePreference;
  readonly hasMultipleWorkspaces: boolean;
}

export interface PasskeyAuditIdentity {
  readonly passkeyId: string;
  readonly credentialId: string;
  readonly deviceType: string | null;
}

export type PasskeyVerificationResult =
  | { readonly status: "not_found" }
  | { readonly status: "workspace_access_denied" }
  | {
      readonly status: "verified";
      readonly context: PasskeyLoginContext;
      readonly passkey: PasskeyAuditIdentity;
    };

export interface PasskeyAuditInput {
  readonly userId: string;
  readonly organizationId?: string;
  readonly passkeyId: string;
  readonly credentialId: string;
  readonly deviceType: string | null;
  readonly ipAddress?: string;
  readonly userAgent?: string | null;
}

function loadPasskeyWithUser(credentialId: string) {
  return prisma.passkey.findUnique({
    where: { credentialID: credentialId },
    include: {
      user: {
        include: {
          accounts: true,
          organizations: {
            orderBy: { createdAt: "asc" },
            include: { organization: true },
          },
          branchRoles: {
            orderBy: { createdAt: "asc" },
            include: {
              role: { include: { permissions: { include: { permission: true } } } },
              branch: true,
            },
          },
        },
      },
    },
  });
}

function buildPasskeyContext(input: {
  readonly dbUser: NonNullable<Awaited<ReturnType<typeof loadPasskeyWithUser>>>["user"];
}): PasskeyLoginContext {
  const { dbUser } = input;
  const onboarding = mapOnboarding(dbUser.metadata);
  const branch = mapBranch(dbUser.branchRoles[0]);
  const branchRole = dbUser.branchRoles[0];
  const fallbackRole = onboarding.onboardingStatus === "IN_PROGRESS" ? "owner" : "member";

  return {
    ...mapIdentity(dbUser),
    ...mapOrganization(dbUser.organizations),
    ...branch,
    ...onboarding,
    roleName: branchRole?.role.name ?? fallbackRole,
    roleSlug: branchRole?.role.slug,
    permissions: extractEffectivePermissions(dbUser.branchRoles, {
      branchId: branch.activeBranchId,
    }),
    hasMultipleWorkspaces:
      onboarding.onboardingStatus === "COMPLETED" && dbUser.organizations.length > 1,
  };
}

export async function verifyPasskeyCredential(
  credentialId: string
): Promise<PasskeyVerificationResult> {
  const passkey = await loadPasskeyWithUser(credentialId);
  if (!passkey?.user) {
    return { status: "not_found" };
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: { increment: 1 } },
  });

  const context = buildPasskeyContext({ dbUser: passkey.user });
  if (context.onboardingStatus !== "IN_PROGRESS" && !context.organizationId) {
    return { status: "workspace_access_denied" };
  }

  return {
    status: "verified",
    context,
    passkey: {
      passkeyId: passkey.id,
      credentialId: passkey.credentialID,
      deviceType: passkey.deviceType,
    },
  };
}

export async function recordPasskeyVerification(input: PasskeyAuditInput): Promise<void> {
  await recordSecurityAuditLog({
    prisma,
    organizationId: input.organizationId,
    userId: input.userId,
    action: AUDIT_EVENT_TYPES.AUTH_PASSKEY_VERIFIED,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? undefined,
    metadata: {
      passkeyId: input.passkeyId,
      credentialId: input.credentialId,
      deviceType: input.deviceType,
    },
  });
}
