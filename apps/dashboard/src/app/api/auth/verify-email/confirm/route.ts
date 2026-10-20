import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { verifyEmailToken } from "@suite/auth";

const confirmBodySchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  const origin = request.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(new URL("/verify-expired?error=missing_token", origin));
  }

  const result = await verifyEmailToken(token, prisma);

  if (result.success) {
    return NextResponse.redirect(new URL("/dashboard?verified=true", origin));
  }

  if (result.reason === "EXPIRED") {
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
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message || "Verification token is required",
          code: "VALIDATION_FAILED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const result = await verifyEmailToken(parseResult.data.token, prisma);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Email verified successfully",
        email: result.email,
      });
    }

    if (result.reason === "EXPIRED") {
      return NextResponse.json(
        {
          type: "/errors/token-expired",
          title: "Verification Token Expired",
          status: 410,
          detail: "The verification link has expired after 24 hours. Please request a new one.",
          code: "TOKEN_EXPIRED",
          email: result.email,
        },
        { status: 410, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json(
      {
        type: "/errors/invalid-token",
        title: "Invalid Verification Token",
        status: 400,
        detail: "The verification token is invalid or has already been used.",
        code: "INVALID_TOKEN",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } }
    );
  } catch (error) {
    console.error("Error confirming email verification token:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while verifying email token.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
