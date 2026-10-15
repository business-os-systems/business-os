import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { hashPassword, validatePasswordComplexity } from "@suite/auth/password";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { isProduction } from "@/lib/env";
import { verifyTurnstileToken } from "@/lib/turnstile";

export function deriveNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] || "User";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "User";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const RegisterSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional().nullable(),
  turnstileToken: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = RegisterSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message ?? "Validation failed",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { email, password, name, turnstileToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Verify Password Complexity per SPEC-AUTH-001 Section 4.1.1
    const complexity = validatePasswordComplexity(password);
    if (!complexity.isValid) {
      return NextResponse.json(
        {
          type: "/errors/weak-password",
          title: "Bad Request",
          status: 400,
          detail:
            "Password must be at least 8 characters and contain at least 1 uppercase letter, 1 number, and 1 special symbol.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Verify Cloudflare Turnstile bot token in production or when token provided
    if (isProduction || turnstileToken) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
      if (!turnstileResult.success) {
        return NextResponse.json(
          {
            type: "/errors/bot-verification-failed",
            title: "Forbidden",
            status: 403,
            detail: "Security verification failed. Please complete the security check and try again.",
          },
          { status: 403, headers: { "Content-Type": "application/problem+json" } }
        );
      }
    }

    // Check if account already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          type: "/errors/user-already-exists",
          title: "Conflict",
          status: 409,
          detail: "An account with this email address already exists. Please sign in instead.",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Hash password with Argon2id
    const hashedPassword = await hashPassword(password);

    // Resolve user's display name from input or dynamically derive from email
    const resolvedName =
      name && name.trim().length > 0 ? name.trim() : deriveNameFromEmail(normalizedEmail);

    // Create User & Credential Account in single transaction
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: resolvedName,
        emailVerified: false,
        metadata: {
          onboarding_status: "IN_PROGRESS",
          current_onboarding_step: 1,
          theme_preference: "system",
        },
        accounts: {
          create: {
            accountId: normalizedEmail,
            providerId: "credential",
            password: hashedPassword,
          },
        },
      },
    });

    // Sign session token for initial user onboarding
    const rawPayload = encodeSessionPayload({
      userId: newUser.id,
      email: newUser.email,
      userName: newUser.name,
      role: "owner",
      permissions: [],
      themePreference: "system",
      timestamp: Date.now(),
      onboardingStatus: "IN_PROGRESS",
      currentOnboardingStep: 1,
    });

    const token = await signSessionToken(rawPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, false);

    const response = NextResponse.json(
      {
        success: true,
        redirectUrl: "/onboarding/step-1",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
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
  } catch (error) {
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Failed to register user",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
