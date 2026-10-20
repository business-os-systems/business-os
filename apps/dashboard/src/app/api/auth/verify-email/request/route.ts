import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { checkRateLimit, enqueueEmail } from "@suite/redis";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/problem-response";
import {
  createEmailVerificationToken,
  sendEmail,
  verifySessionToken,
  decodeSessionPayload,
  SESSION_COOKIE_NAME,
} from "@suite/auth";
import { RATE_LIMITS } from "@suite/core";

const requestBodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let targetEmail: string | undefined;

    // 1. Resolve email from cryptographically verified session cookie first
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
      const isValid = await verifySessionToken(sessionCookie);
      if (isValid) {
        const payload = decodeSessionPayload(sessionCookie);
        if (payload?.email) {
          targetEmail = payload.email;
        }
      }
    }

    // 2. If not in session, parse email from request body
    if (!targetEmail) {
      const body = await request.json().catch(() => ({}));
      const parseResult = requestBodySchema.safeParse(body);
      if (!parseResult.success) {
        return zodProblemResponse(parseResult.error, {
          detail: "A valid email address is required to dispatch verification link.",
        });
      }
      if (parseResult.data.email) {
        targetEmail = parseResult.data.email;
      }
    }

    if (!targetEmail) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_FAILED",
        title: "Bad Request",
        detail: "Email address is required to dispatch verification link.",
      });
    }

    const normalizedEmail = targetEmail.toLowerCase().trim();

    // 3. Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user || user.emailVerified) {
      // Do not leak email existence or verification status to prevent user enumeration (Issue 36)
      return successResponse({
        success: true,
        message: "If an account exists with this email, a verification link has been dispatched.",
      });
    }

    // 4. Dual-Tier Rate Limiting via @suite/redis (Tier 1: IP, Tier 2: Email)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimit = await checkRateLimit([
      ...(clientIp !== "unknown"
        ? [{ key: `ratelimit:verify-email:ip:${clientIp}`, max: RATE_LIMITS.MAX_VERIFY_EMAIL_PER_HOUR_IP, windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS }]
        : []),
      { key: `ratelimit:verify-email:${normalizedEmail}`, max: RATE_LIMITS.MAX_VERIFY_EMAIL_PER_HOUR_EMAIL, windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS },
    ]);

    if (!rateLimit.allowed) {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: rateLimit.detail || "Rate limit exceeded. Maximum 5 verification emails allowed per hour.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    // 5. Generate secure verification token (24-hour expiry)
    const { rawToken } = await createEmailVerificationToken(normalizedEmail, prisma);

    // 6. Asynchronously dispatch email via BullMQ queue (Issue 54) with fallback
    const origin = request.nextUrl.origin;
    const verificationUrl = `${origin}/api/auth/verify-email/confirm?token=${rawToken}`;
    const emailPayload = {
      to: normalizedEmail,
      subject: "Verify your email address - Business OS",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1E1B19;">Verify your email address</h2>
          <p style="color: #5C504B; font-size: 15px; line-height: 1.5;">
            Thank you for joining Business OS. Click the button below to verify your email address and unlock full workspace access.
          </p>
          <div style="margin: 32px 0;">
            <a href="${verificationUrl}" style="background-color: #F87171; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #8C7B75; font-size: 13px;">
            This link is valid for 24 hours. If you did not create this account, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Verify your Business OS email address by visiting: ${verificationUrl}`,
    };

    try {
      await enqueueEmail(emailPayload);
    } catch {
      await sendEmail(emailPayload);
    }

    return successResponse({
      success: true,
      message: "If an account exists with this email, a verification link has been dispatched.",
    });
  } catch (error) {
    console.error("Error dispatching email verification link:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while dispatching verification email.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
