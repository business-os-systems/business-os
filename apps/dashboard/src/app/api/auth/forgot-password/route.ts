import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import { createPasswordResetToken, sendEmail } from "@suite/auth";
import { isProduction } from "@/lib/env";
import { verifyTurnstileToken } from "@/lib/turnstile";

const requestBodySchema = z.object({
  email: z.string().email("Valid email address is required"),
  turnstileToken: z.string().optional().nullable(),
});

const MAX_REQUESTS_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = requestBodySchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message || "Valid email address is required",
          code: "VALIDATION_FAILED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { email, turnstileToken } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

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

    // 1. Rate Limiting via Redis (Max 5 requests per hour)
    const rateLimitKey = `ratelimit:forgot-password:${normalizedEmail}`;
    try {
      const currentCount = await redis.incr(rateLimitKey);
      if (currentCount === 1) {
        await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
      }

      if (currentCount > MAX_REQUESTS_PER_HOUR) {
        const ttl = await redis.ttl(rateLimitKey);
        const retryAfter = ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS;

        return NextResponse.json(
          {
            type: "/errors/rate-limit-exceeded",
            title: "Too Many Requests",
            status: 429,
            detail: "Rate limit exceeded. Maximum 5 password reset requests allowed per hour.",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter,
          },
          {
            status: 429,
            headers: {
              "Content-Type": "application/problem+json",
              "Retry-After": String(retryAfter),
            },
          }
        );
      }
    } catch {
      // Degraded fail-safe rate limiting via PostgreSQL (SEC-04)
      const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000);
      const recentAttempts = await prisma.verification.count({
        where: {
          identifier: normalizedEmail,
          createdAt: { gte: oneHourAgo },
        },
      });

      if (recentAttempts >= MAX_REQUESTS_PER_HOUR) {
        return NextResponse.json(
          {
            type: "/errors/rate-limit-exceeded",
            title: "Too Many Requests",
            status: 429,
            detail: "Rate limit exceeded. Maximum 5 password reset requests allowed per hour.",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter: RATE_LIMIT_WINDOW_SECONDS,
          },
          {
            status: 429,
            headers: {
              "Content-Type": "application/problem+json",
              "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS),
            },
          }
        );
      }
    }

    // 2. Find user in database
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (!user) {
      // Security: Do not reveal email existence to prevent user enumeration
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a password reset link has been dispatched.",
      });
    }

    // 3. Generate 15-minute single-use reset token
    const { rawToken } = await createPasswordResetToken(normalizedEmail, prisma);

    // 4. Dispatch email via pluggable transporter
    const origin = request.nextUrl.origin || "http://localhost:3001";
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;

    await sendEmail({
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
    });

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a password reset link has been dispatched.",
    });
  } catch (error) {
    console.error("Error processing password recovery request:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while processing password recovery.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
