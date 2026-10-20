import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { checkRateLimit } from "@suite/redis";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse } from "@/lib/problem-response";
import { z } from "zod";

const checkSlugQuerySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(100, "Slug must not exceed 100 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
});

const MAX_SLUG_CHECKS_PER_MINUTE_IP = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Issue 44: Rate limit public tenant slug availability seeks
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (clientIp !== "unknown") {
      const rateLimit = await checkRateLimit([
        {
          key: `ratelimit:check-slug:ip:${clientIp}`,
          max: MAX_SLUG_CHECKS_PER_MINUTE_IP,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        },
      ]);

      if (!rateLimit.allowed) {
        return problemResponse({
          status: 429,
          code: "RATE_LIMIT_EXCEEDED",
          title: "Too Many Requests",
          detail: "Too many slug availability requests. Please slow down.",
          retryAfter: rateLimit.retryAfter,
        });
      }
    }

    const { searchParams } = new URL(request.url);
    const parseResult = checkSlugQuerySchema.safeParse({
      slug: searchParams.get("slug") || "",
    });

    if (!parseResult.success) {
      return problemResponse({
        status: 400,
        code: "INVALID_SLUG",
        title: "Bad Request",
        detail: parseResult.error.errors[0]?.message || "Invalid slug format",
      });
    }

    const { slug } = parseResult.data;

    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    let isCurrentOrg = false;
    if (existingOrg) {
      const sessionResult = await getAuthenticatedSession(request);
      if (sessionResult.ok) {
        const session = sessionResult.session;
        if (session.organizationId === existingOrg.id) {
          isCurrentOrg = true;
        } else {
          const membership = await prisma.userOrganization.findUnique({
            where: {
              userId_organizationId: {
                userId: session.userId,
                organizationId: existingOrg.id,
              },
            },
            select: { status: true },
          });
          if (membership) {
            isCurrentOrg = true;
          }
        }
      }
    }

    const available = !existingOrg || isCurrentOrg;

    return NextResponse.json({
      available,
      isCurrentOrg,
      slug,
    });
  } catch (error) {
    console.error("Error checking slug availability:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while checking slug availability.",
    });
  }
}
