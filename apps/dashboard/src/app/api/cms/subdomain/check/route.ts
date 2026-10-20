import { NextResponse } from "next/server";
import { SiteService } from "@suite/website-builder/services";
import { checkRateLimit } from "@suite/redis";
import { problemResponse } from "@/lib/problem-response";

const MAX_SUBDOMAIN_CHECKS_PER_MINUTE_IP = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function GET(request: Request) {
  try {
    // Rate limit subdomain checks per IP
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (clientIp !== "unknown") {
      const rateLimit = await checkRateLimit([
        {
          key: `ratelimit:check-subdomain:ip:${clientIp}`,
          max: MAX_SUBDOMAIN_CHECKS_PER_MINUTE_IP,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        },
      ]);

      if (!rateLimit.allowed) {
        return problemResponse({
          status: 429,
          code: "RATE_LIMIT_EXCEEDED",
          title: "Too Many Requests",
          detail: "Too many subdomain availability requests. Please slow down.",
          retryAfter: rateLimit.retryAfter,
        });
      }
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

    const service = new SiteService();
    const result = await service.checkSubdomainAvailability(subdomain);

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
