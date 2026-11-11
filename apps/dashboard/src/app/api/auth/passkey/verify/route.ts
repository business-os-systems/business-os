import { z } from "zod";
import type { NextResponse } from "next/server";
import {
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  createTenantSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { bindSessionToRequestHost, readRequestHostname } from "@/lib/tenant-host";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { verifyBotChallenge } from "@/services/bot-defense.service";
import {
  recordPasskeyVerification,
  verifyPasskeyCredential,
  type PasskeyAuditIdentity,
  type PasskeyLoginContext,
} from "@/services/passkey.service";

const PasskeyVerifySchema = z.object({
  id: z.string({ required_error: "Credential ID is required" }).min(1, "Credential ID is required"),
  rawId: z.string().optional(),
  type: z.string().optional(),
  response: z.record(z.unknown()).optional(),
  turnstileToken: z.string().optional().nullable(),
});

async function buildPasskeyResponse(
  context: PasskeyLoginContext,
  requestHostname: string | null
): Promise<NextResponse> {
  const redirectUrl = context.hasMultipleWorkspaces
    ? "/choose-tenant"
    : resolvePostLoginRoute({
        permissions: context.permissions,
        onboardingStatus: context.onboardingStatus,
        currentOnboardingStep: context.currentOnboardingStep,
      });

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
      timestamp: Date.now(),
      onboardingStatus: context.onboardingStatus,
      currentOnboardingStep: context.currentOnboardingStep,
    },
    requestHostname
  );
  const token = await signSessionToken(encodeSessionPayload(sessionPayload));
  const cookieOptions = createTenantSessionCookieOptions(
    SESSION_EPHEMERAL_MAX_AGE_SECONDS
  );

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
    const parseResult = PasskeyVerifySchema.safeParse(rawBody);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message ?? "Invalid passkey payload",
      });
    }

    const { id, turnstileToken } = parseResult.data;
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const botPassed = await verifyBotChallenge({ token: turnstileToken, clientIp });
    if (!botPassed) {
      return problemResponse({
        status: 403,
        code: "BOT_VERIFICATION_FAILED",
        title: "Forbidden",
        detail: "Security verification failed. Please complete the security check and try again.",
      });
    }

    const result = await verifyPasskeyCredential(id);
    if (result.status === "not_found") {
      return problemResponse({
        status: 401,
        code: "INVALID_CREDENTIALS",
        title: "Unauthorized",
        detail: "Passkey credential not recognized or unregistered.",
      });
    }
    if (result.status === "workspace_access_denied") {
      return problemResponse({
        status: 403,
        code: "WORKSPACE_ACCESS_DENIED",
        title: "Forbidden",
        detail: "Account is not associated with an active enterprise workspace.",
      });
    }

    const response = await buildPasskeyResponse(
      result.context,
      readRequestHostname(request)
    );
    await recordPasskeyAudit(result.passkey, result.context, request);
    return response;
  } catch (error) {
    console.error("Error verifying passkey:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: error instanceof Error ? error.message : "Failed to verify passkey",
    });
  }
}

async function recordPasskeyAudit(
  passkey: PasskeyAuditIdentity,
  context: PasskeyLoginContext,
  request: Request
): Promise<void> {
  await recordPasskeyVerification({
    userId: context.userId,
    organizationId: context.organizationId,
    passkeyId: passkey.passkeyId,
    credentialId: passkey.credentialId,
    deviceType: passkey.deviceType,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent"),
  });
}