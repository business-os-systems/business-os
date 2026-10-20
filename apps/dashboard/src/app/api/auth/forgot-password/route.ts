import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { checkRateLimit, enqueueEmail } from "@suite/redis";
import { createPasswordResetToken, sendEmail } from "@suite/auth";
import { RATE_LIMITS } from "@suite/core";
import { isProduction } from "@/lib/env";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";

const requestBodySchema = z.object({
  email: z.string().email("Valid email address is required"),
  turnstileToken: z.string().optional().nullable(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = requestBodySchema.safeParse(body);

    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message || "Valid email address is required",
      });
    }

    const { email, turnstileToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Verify Cloudflare Turnstile bot token in production or when token provided
    if (isProduction || turnstileToken) {
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

    // 1. Dual-Tier Rate Limiting via @suite/redis (Tier 1: IP, Tier 2: Email)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimit = await checkRateLimit([
      ...(clientIp !== "unknown"
        ? [{ key: `ratelimit:forgot-password:ip:${clientIp}`, max: RATE_LIMITS.MAX_PASSWORD_RESET_PER_HOUR_IP, windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS }]
        : []),
      { key: `ratelimit:forgot-password:${normalizedEmail}`, max: RATE_LIMITS.MAX_PASSWORD_RESET_PER_HOUR_EMAIL, windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS },
    ]);

    if (!rateLimit.allowed) {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: rateLimit.detail || "Rate limit exceeded. Maximum 5 password reset requests allowed per hour.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    // 2. Find user in database
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (!user) {
      // Security: Do not reveal email existence to prevent user enumeration
      return successResponse({
        success: true,
        message: "If an account exists with this email, a password reset link has been dispatched.",
      });
    }

    // 3. Generate 15-minute single-use reset token
    const { rawToken } = await createPasswordResetToken(normalizedEmail, prisma);

    // 4. Asynchronously enqueue email dispatch via BullMQ background queue (Issue 54)
    const origin = request.nextUrl.origin;
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;
    const emailPayload = {
      to: normalizedEmail,
      subject: "Reset your password - Business OS",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1E1B19;">Reset your password</h2>
          <p style="color: #5C504B; font-size: 15px; line-height: 1.5;">
            We received a request to reset the password for your Business OS account. Click the button below to choose a new password.
          </p>
          <div style="margin: 32px 0;">
            <a href="${resetUrl}" style="background-color: #0F766E; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #8C7B75; font-size: 13px;">
            This link is valid for 15 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Reset your Business OS password by visiting: ${resetUrl}`,
    };

    try {
      await enqueueEmail(emailPayload);
    } catch {
      // Graceful fallback to direct dispatch if redis queue is unavailable
      await sendEmail(emailPayload);
    }

    return successResponse({
      success: true,
      message: "If an account exists with this email, a password reset link has been dispatched.",
    });
  } catch (error) {
    console.error("Error processing password recovery request:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while processing password recovery.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
