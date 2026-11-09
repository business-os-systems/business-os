import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestOrigin } from "@/lib/origin";
import { problemResponse } from "@/lib/problem-response";
import { confirmEmailVerification } from "@/services/email-verification.service";

const confirmBodySchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  const origin = resolveRequestOrigin(request);

  if (!token) {
    return NextResponse.redirect(new URL("/verify-expired?error=missing_token", origin));
  }

  const result = await confirmEmailVerification(token);
  if (result.status === "verified") {
    return NextResponse.redirect(new URL("/dashboard?verified=true", origin));
  }
  if (result.status === "expired") {
    return NextResponse.redirect(
      new URL(`/verify-expired?email=${encodeURIComponent(result.email)}&expired=true`, origin)
    );
  }
  return NextResponse.redirect(new URL("/verify-expired?error=invalid_token", origin));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = confirmBodySchema.safeParse(body);
    if (!parseResult.success) {
      return problemResponse({
        type: "/errors/validation-failed",
        title: "Bad Request",
        status: 400,
        detail: parseResult.error.issues[0]?.message || "Verification token is required",
        code: "VALIDATION_FAILED",
      });
    }

    const result = await confirmEmailVerification(parseResult.data.token);
    if (result.status === "verified") {
      return NextResponse.json({
        success: true,
        message: "Email verified successfully",
        email: result.email,
      });
    }
    if (result.status === "expired") {
      return problemResponse({
        type: "/errors/token-expired",
        title: "Verification Token Expired",
        status: 410,
        detail: "The verification link has expired after 24 hours. Please request a new one.",
        code: "TOKEN_EXPIRED",
        extra: { email: result.email },
      });
    }
    return problemResponse({
      type: "/errors/invalid-token",
      title: "Invalid Verification Token",
      status: 400,
      detail: "The verification token is invalid or has already been used.",
      code: "INVALID_TOKEN",
    });
  } catch (error) {
    console.error("Error confirming email verification token:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while verifying email token.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
