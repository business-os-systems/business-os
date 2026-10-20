import { z } from "zod";
import { prisma } from "@suite/db";
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
import { AUDIT_EVENT_TYPES } from "@suite/core";

import { isProduction } from "@/lib/env";
import { verifyTurnstileToken, isTurnstileConfigured } from "@/lib/turnstile";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, successResponse } from "@/lib/api-response";

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
      return problemResponse({
        status: 400,
        code: "VALIDATION_FAILED",
        title: "Bad Request",
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
    const credentialAccount = dbUser.accounts.find((a) => a.providerId === "credential");
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

    const membership = dbUser.organizations[0];
    const organization = membership?.organization;
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

    const userAgent = request.headers.get("user-agent");
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

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
