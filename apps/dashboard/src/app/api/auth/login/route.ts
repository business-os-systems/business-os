import { z } from "zod";
import type { NextResponse } from "next/server";
import {
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  createTenantSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { bindSessionToRequestHost, readRequestHostname } from "@/lib/tenant-host";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { verifyBotChallenge } from "@/services/bot-defense.service";
import {
  authenticateWithPassword,
  recordSuccessfulLogin,
  type LoginSessionContext,
  type PasswordLoginResult,
} from "@/services/login.service";

const LoginSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
  keepSignedIn: z.boolean().optional().default(false),
  turnstileToken: z.string().optional().nullable(),
});

type LoginFailure = Exclude<PasswordLoginResult, { status: "authenticated" }>;

function mapLoginProblem(failure: LoginFailure): NextResponse {
  switch (failure.status) {
    case "invalid_credentials":
      return problemResponse({
        status: 401,
        code: "INVALID_CREDENTIALS",
        title: "Unauthorized",
        detail: "Invalid email or password. Please check your credentials.",
      });
    case "workspace_access_denied":
      return problemResponse({
        status: 403,
        code: "WORKSPACE_ACCESS_DENIED",
        title: "Forbidden",
        detail: "Account is not associated with an active enterprise workspace.",
      });
    case "workspace_suspended":
      return problemResponse({
        status: 403,
        code: PLATFORM_ERROR_CODE.TENANT_SUSPENDED,
        title: "Workspace Suspended",
        detail: "This workspace is suspended. Contact your platform administrator.",
      });
    case "workspace_archived":
      return problemResponse({
        status: 403,
        code: PLATFORM_ERROR_CODE.TENANT_ARCHIVED,
        title: "Workspace Archived",
        detail: "This workspace has been archived and can no longer be accessed.",
      });
  }
}

async function buildLoginResponse(
  context: LoginSessionContext,
  keepSignedIn: boolean,
  requestHostname: string | null
): Promise<NextResponse> {
  const redirectUrl = context.hasMultipleWorkspaces
    ? "/choose-tenant"
    : resolvePostLoginRoute({
        permissions: context.permissions,
        onboardingStatus: context.onboardingStatus,
        currentOnboardingStep: context.currentOnboardingStep,
      });

  const now = Date.now();
  const maxAgeSeconds = keepSignedIn
    ? SESSION_PERSISTENT_MAX_AGE_SECONDS
    : SESSION_EPHEMERAL_MAX_AGE_SECONDS;
  const expiresAt = now + maxAgeSeconds * 1000;

  const sessionPayload = bindSessionToRequestHost(
    {
      userId: context.userId,
      email: context.email,
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      role: context.roleName,
      permissions: context.permissions,
      userName: context.userName,
      activeBranchId: context.activeBranchId,
      activeBranchName: context.activeBranchName,
      themePreference: context.themePreference,
      timestamp: now,
      expiresAt,
      isEphemeral: !keepSignedIn,
      onboardingStatus: context.onboardingStatus,
      currentOnboardingStep: context.currentOnboardingStep,
    },
    requestHostname
  );
  const token = await signSessionToken(encodeSessionPayload(sessionPayload));
  const cookieOptions = createTenantSessionCookieOptions(maxAgeSeconds);
  const response = successResponse({
    success: true,
    redirectUrl,
    themePreference: context.themePreference,
    user: {
      id: context.userId,
      email: context.email,
      name: context.userName,
      role: context.roleName,
      roleSlug: context.roleSlug ?? context.roleName,
      permissions: context.permissions,
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      onboardingStatus: context.onboardingStatus,
      currentOnboardingStep: context.currentOnboardingStep,
    },
  });

  response.cookies.set({ ...cookieOptions, value: token });
  return response;
}

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
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    const botPassed = await verifyBotChallenge({ token: turnstileToken, clientIp });
    if (!botPassed) {
      return problemResponse({
        status: 403,
        code: "BOT_VERIFICATION_FAILED",
        title: "Forbidden",
        detail: "Security verification failed. Please complete the security check and try again.",
      });
    }

    const login = await authenticateWithPassword({
      email: email.toLowerCase().trim(),
      password,
      ipAddress: clientIp,
      userAgent,
    });
    if (login.status !== "authenticated") {
      return mapLoginProblem(login);
    }

    const response = await buildLoginResponse(
      login.context,
      keepSignedIn,
      readRequestHostname(request)
    );
    await recordSuccessfulLogin({
      userId: login.context.userId,
      organizationId: login.context.organizationId,
      ipAddress: clientIp,
      userAgent,
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