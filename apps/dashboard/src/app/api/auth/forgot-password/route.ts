import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestOrigin } from "@/lib/origin";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { verifyBotChallenge } from "@/services/bot-defense.service";
import { requestPasswordReset } from "@/services/password-reset.service";

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

    const result = await requestPasswordReset({
      email: normalizedEmail,
      clientIp,
      origin: resolveRequestOrigin(request),
    });

    if (result.status === "rate_limited") {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail:
          result.detail ||
          "Rate limit exceeded. Maximum 5 password reset requests allowed per hour.",
        retryAfter: result.retryAfter,
      });
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
