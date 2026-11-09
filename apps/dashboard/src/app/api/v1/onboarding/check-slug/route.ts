import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, zodProblemResponse } from "@/lib/problem-response";
import {
  enforceSlugCheckRateLimit,
  findOrganizationIdBySlug,
  isSlugOwnedByCaller,
} from "@/services/onboarding.service";

const checkSlugQuerySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(100, "Slug must not exceed 100 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const rateLimit = await enforceSlugCheckRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: "Too many slug availability requests. Please slow down.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    const { searchParams } = new URL(request.url);
    const parseResult = checkSlugQuerySchema.safeParse({
      slug: searchParams.get("slug") || "",
    });
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        code: "INVALID_SLUG",
        detail: parseResult.error.errors[0]?.message || "Invalid slug format",
      });
    }

    const slug = parseResult.data.slug;
    const organizationId = await findOrganizationIdBySlug(slug);
    const sessionResult = await getAuthenticatedSession(request);
    const isCurrentOrg = await isSlugOwnedByCaller({
      organizationId,
      userId: sessionResult.ok ? sessionResult.session.userId : undefined,
      sessionOrganizationId: sessionResult.ok ? sessionResult.session.organizationId : undefined,
    });

    return NextResponse.json({
      available: !organizationId || isCurrentOrg,
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
