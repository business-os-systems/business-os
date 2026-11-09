import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  decodeSessionPayload,
  verifySessionToken,
} from "@suite/auth";
import { problemResponse, successResponse } from "@/lib/problem-response";
import { resolveRequestOrigin } from "@/lib/origin";
import { requestEmailVerification } from "@/services/email-verification.service";

const requestBodySchema = z.object({
  email: z.string().email().optional(),
});

const DISPATCH_MESSAGE =
  "If an account exists with this email, a verification link has been dispatched.";

async function resolveTargetEmail(request: NextRequest): Promise<string | undefined> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const isValid = await verifySessionToken(sessionCookie);
    if (isValid) {
      const payload = decodeSessionPayload(sessionCookie);
      if (payload?.email) {
        return payload.email;
      }
    }
  }

  const body = await request.json().catch(() => ({}));
  const parseResult = requestBodySchema.safeParse(body);
  return parseResult.success ? parseResult.data.email : undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const targetEmail = await resolveTargetEmail(request);
    if (!targetEmail) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_FAILED",
        title: "Bad Request",
        detail: "Email address is required to dispatch verification link.",
      });
    }

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const result = await requestEmailVerification({
      email: targetEmail.toLowerCase().trim(),
      clientIp,
      origin: resolveRequestOrigin(request),
    });

    if (result.status === "rate_limited") {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: result.detail || "Rate limit exceeded. Maximum 5 verification emails allowed per hour.",
        retryAfter: result.retryAfter,
      });
    }

    return successResponse({ success: true, message: DISPATCH_MESSAGE });
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
