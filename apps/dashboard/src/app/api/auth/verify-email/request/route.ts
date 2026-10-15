import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import {
  createEmailVerificationToken,
  sendEmail,
  decodeSessionPayload,
  SESSION_COOKIE_NAME,
} from "@suite/auth";

const requestBodySchema = z.object({
  email: z.string().email().optional(),
});

const MAX_REQUESTS_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let targetEmail: string | undefined;

    // 1. Resolve email from authenticated session cookie first
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
      const payload = decodeSessionPayload(sessionCookie);
      if (payload?.email) {
        targetEmail = payload.email;
      }
    }

    // 2. If not in session, parse email from request body
    if (!targetEmail) {
      const body = await request.json().catch(() => ({}));
      const parseResult = requestBodySchema.safeParse(body);
      if (parseResult.success && parseResult.data.email) {
        targetEmail = parseResult.data.email;
      }
    }

    if (!targetEmail) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: "Email address is required to dispatch verification link.",
          code: "VALIDATION_FAILED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const normalizedEmail = targetEmail.toLowerCase().trim();

    // 3. Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user) {
      // Do not leak email existence to prevent user enumeration
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a verification link has been dispatched.",
      });
    }

    if (user.emailVerified) {
      return NextResponse.json({
        success: true,
        message: "Email is already verified.",
        alreadyVerified: true,
      });
    }

    // 4. Rate Limiting via Redis (Max 5 requests per hour)
    const rateLimitKey = `ratelimit:verify-email:${normalizedEmail}`;
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
            detail: "Rate limit exceeded. Maximum 5 verification emails allowed per hour.",
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
      // If Redis is unreachable, bypass rate limit check without in-memory state (Zero Static Data law)
    }

    // 5. Generate secure verification token (24-hour expiry)
    const { rawToken } = await createEmailVerificationToken(normalizedEmail, prisma);

    // 6. Dispatch email via pluggable transporter
    const origin = request.nextUrl.origin || "http://localhost:3001";
    const verificationUrl = `${origin}/api/auth/verify-email/confirm?token=${rawToken}`;

    await sendEmail({
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
    });

    return NextResponse.json({
      success: true,
      message: "Verification link dispatched",
    });
  } catch (error) {
    console.error("Error dispatching email verification link:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while dispatching verification email.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
