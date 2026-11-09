import { NextResponse } from "next/server";
import { problemResponse } from "@/lib/problem-response";
import {
  checkSubdomainAvailability,
  enforceSubdomainCheckRateLimit,
} from "@/services/cms-subdomain.service";

export async function GET(request: Request) {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const rateLimit = await enforceSubdomainCheckRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: "Too many subdomain availability requests. Please slow down.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get("subdomain");
    if (!subdomain || subdomain.trim().length < 2) {
      return problemResponse({
        status: 400,
        code: "INVALID_SUBDOMAIN",
        title: "Bad Request",
        detail: "Subdomain must be at least 2 characters",
      });
    }

    const result = await checkSubdomainAvailability(subdomain);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    console.error("Error checking subdomain availability:", err);
    return problemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while checking subdomain availability.",
    });
  }
}
