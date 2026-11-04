import { z } from "zod";
import { prisma, type Account } from "@suite/db";
import { verifyPassword } from "@suite/auth/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  createSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { getUserOnboardingState, extractEffectivePermissions, recordSecurityAuditLog } from "@suite/auth";
import {
  AUDIT_EVENT_TYPES,
  PLATFORM_ERROR_CODE,
  TENANT_STATUS,
  isBlockingTenantStatus,
} from "@suite/core";

import { isProduction } from "@/lib/env";
import { verifyTurnstileToken, isTurnstileConfigured } from "@/lib/turnstile";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";

const LoginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
  keepSignedIn: z.boolean().optional().default(false),
  turnstileToken: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = LoginSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { email, password, keepSignedIn, turnstileToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Verify Cloudflare Turnstile bot token when configured (strictly enforced in production)
    const isBotDefenseRequired = isProduction && isTurnstileConfigured();
    if (isBotDefenseRequired || (isTurnstileConfigured() && turnstileToken)) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
      if (!turnstileResult.success) {
        return problemResponse({
          status: 403,
          code: "BOT_VERIFICATION_FAILED",
          title: "Forbidden",
          detail: "Security verification failed. Please complete the security check and try again.",
        });
      }
    }

    // Verify user in PostgreSQL database
    const dbUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        accounts: true,
        organizations: {
          orderBy: { createdAt: "asc" },
          include: {
            organization: true,
          },
        },
        branchRoles: {
          orderBy: { createdAt: "asc" },
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
            branch: true,
          },
        },
      },
    });

    if (!dbUser) {
      return problemResponse({
        status: 401,
        code: "INVALID_CREDENTIALS",
        title: "Unauthorized",
        detail: "Invalid email or password. Please check your credentials.",
      });
    }

    // Verify credential account and password exist
    const credentialAccount = dbUser.accounts.find((a: Account) => a.providerId === "credential");
    if (!credentialAccount || !credentialAccount.password) {
      return problemResponse({
        status: 401,
        code: "INVALID_CREDENTIALS",
        title: "Unauthorized",
        detail: "Invalid email or password. Please check your credentials.",
      });
    }

    const isPasswordValid = await verifyPassword(password, credentialAccount.password);
    if (!isPasswordValid) {
      return problemResponse({
        status: 401,
        code: "INVALID_CREDENTIALS",
        title: "Unauthorized",
        detail: "Invalid email or password. Please check your credentials.",
      });
    }

    const onboardingState = getUserOnboardingState(dbUser.metadata);
    const onboardingStatus = onboardingState.onboardingStatus;
    const currentOnboardingStep = onboardingState.currentOnboardingStep ?? undefined;
    const themePreference = onboardingState.themePreference;

    // Choose a workspace the platform has not blocked. Falling back to the
    // oldest membership keeps the existing session shape, and the refusal
    // below then rejects the sign-in because no usable workspace exists.
    const usableMembership = dbUser.organizations.find(
      (candidate) => !isBlockingTenantStatus(candidate.organization.status)
    );
    const membership = usableMembership ?? dbUser.organizations[0];
    const organization = membership?.organization;
    const userAgent = request.headers.get("user-agent");
    const clientIp = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const branchRole = dbUser.branchRoles[0];
    const roleName = branchRole?.role?.name;
    const roleSlug = branchRole?.role?.slug;
    const branchName = branchRole?.branch?.name ?? undefined;
    const branchId = branchRole?.branchId ?? undefined;

    // Check workspace membership if onboarding is completed
    if (onboardingStatus !== "IN_PROGRESS" && !organization) {
      return problemResponse({
        status: 403,
        code: "WORKSPACE_ACCESS_DENIED",
        title: "Forbidden",
        detail: "Account is not associated with an active enterprise workspace.",
      });
    }

    // A platform lifecycle decision outranks the password: suspension blocks
    // new sign-ins, and an archived workspace never issues a session (FR-017).
    if (organization?.status === TENANT_STATUS.SUSPENDED) {
      await recordSecurityAuditLog({
        prisma,
        organizationId: organization.id,
        userId: dbUser.id,
        action: AUDIT_EVENT_TYPES.AUTH_LOGIN_REJECTED,
        ipAddress: clientIp,
        userAgent,
        metadata: { method: "password", reason: "WORKSPACE_SUSPENDED" },
      });
      return problemResponse({
        status: 403,
        code: PLATFORM_ERROR_CODE.TENANT_SUSPENDED,
        title: "Workspace Suspended",
        detail:
          "This workspace is suspended. Contact your platform administrator.",
      });
    }
    if (organization?.status === TENANT_STATUS.ARCHIVED) {
      await recordSecurityAuditLog({
        prisma,
        organizationId: organization.id,
        userId: dbUser.id,
        action: AUDIT_EVENT_TYPES.AUTH_LOGIN_REJECTED,
        ipAddress: clientIp,
        userAgent,
        metadata: { method: "password", reason: "WORKSPACE_ARCHIVED" },
      });
      return problemResponse({
        status: 403,
        code: PLATFORM_ERROR_CODE.TENANT_ARCHIVED,
        title: "Workspace Archived",
        detail: "This workspace has been archived and can no longer be accessed.",
      });
    }

    // Extract dynamic permissions scoped to the active branch or organization-wide assignments
    const userPermissions = extractEffectivePermissions(dbUser.branchRoles, { branchId });



    const hasMultipleWorkspaces =
      onboardingStatus === "COMPLETED" && dbUser.organizations.length > 1;

    // Resolve post-login route based on dynamic permissions and lifecycle state
    const redirectUrl = hasMultipleWorkspaces
      ? "/choose-tenant"
      : resolvePostLoginRoute({
          permissions: userPermissions,
          onboardingStatus,
          currentOnboardingStep,
        });

    // Generate cryptographically signed session token with verified tenant payload
    const now = Date.now();
    const maxAgeSeconds = keepSignedIn
      ? SESSION_PERSISTENT_MAX_AGE_SECONDS
      : SESSION_EPHEMERAL_MAX_AGE_SECONDS;
    const expiresAt = now + maxAgeSeconds * 1000;

    const rawPayload = encodeSessionPayload({
      userId: dbUser.id,
      email: dbUser.email,
      organizationId: organization?.id,
      organizationName: organization?.name,
      role: roleName,
      permissions: userPermissions,
      userName: dbUser.name,
      activeBranchId: branchId,
      activeBranchName: branchName,
      themePreference,
      timestamp: now,
      expiresAt,
      isEphemeral: !keepSignedIn,
      onboardingStatus,
      currentOnboardingStep,
    });

    const token = await signSessionToken(rawPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, keepSignedIn);

    const response = successResponse({
      success: true,
      redirectUrl,
      themePreference,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleName,
        roleSlug: roleSlug || roleName,
        permissions: userPermissions,
        organizationId: organization?.id,
        organizationName: organization?.name,
        onboardingStatus,
        currentOnboardingStep,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: dbUser.id,
      action: AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
      ipAddress: clientIp,
      userAgent,
      metadata: { method: "password" },
    });

    return response;
  } catch (error) {
    console.error("Error authenticating session:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: error instanceof Error ? error.message : "Failed to authenticate session",
    });
  }
}
