import { z } from "zod";
import type { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { validatePasswordComplexity } from "@suite/auth/password";
import { resolveRequestOrigin } from "@/lib/origin";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { verifyBotChallenge } from "@/services/bot-defense.service";
import {
  registerCredentialAccount,
  type CreatedAccountDto,
} from "@/services/register.service";

export { deriveNameFromEmail } from "@/services/register.service";

const RegisterSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  name: z.string().optional().nullable(),
  turnstileToken: z.string().optional().nullable(),
});

function buildExistingAccountResponse(): NextResponse {
  return successResponse(
    {
      success: true,
      message:
        "If you do not already have an account, your workspace has been initialized. Please check your email.",
      redirectUrl: "/login?registered=pending",
    },
    { status: 200 }
  );
}

async function buildCreatedAccountResponse(user: CreatedAccountDto): Promise<NextResponse> {
  const rawPayload = encodeSessionPayload({
    userId: user.id,
    email: user.email,
    userName: user.name,
    permissions: [],
    themePreference: "system",
    timestamp: Date.now(),
    onboardingStatus: "IN_PROGRESS",
    currentOnboardingStep: 1,
  });

  const token = await signSessionToken(rawPayload);
  const cookieOptions = createSessionCookieOptions(false);
  const response = successResponse(
    {
      success: true,
      redirectUrl: "/onboarding/step-1",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
        permissions: [],
        onboardingStatus: "IN_PROGRESS",
        currentOnboardingStep: 1,
      },
    },
    { status: 201 }
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = RegisterSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { email, password, name, turnstileToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const complexity = validatePasswordComplexity(password);
    if (!complexity.isValid) {
      return problemResponse({
        status: 400,
        code: "WEAK_PASSWORD",
        title: "Bad Request",
        detail:
          "Password must be at least 12 characters and contain at least 1 uppercase letter, 1 number, and 1 special symbol.",
      });
    }

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

    const registration = await registerCredentialAccount({
      email: normalizedEmail,
      password,
      name: name ?? undefined,
      origin: resolveRequestOrigin(request),
    });

    if (registration.status === "existing_account") {
      return buildExistingAccountResponse();
    }
    return await buildCreatedAccountResponse(registration.user);
  } catch (error) {
    console.error("Error registering user:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: error instanceof Error ? error.message : "Failed to register user",
    });
  }
}
