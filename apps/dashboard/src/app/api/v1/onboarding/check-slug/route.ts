import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
} from "@suite/auth/session";
import { z } from "zod";

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
    const { searchParams } = new URL(request.url);
    const parseResult = checkSlugQuerySchema.safeParse({
      slug: searchParams.get("slug") || "",
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.errors[0]?.message || "Invalid slug format",
          code: "INVALID_SLUG",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { slug } = parseResult.data;

    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    let isCurrentOrg = false;
    if (existingOrg) {
      const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (sessionCookie) {
        const isValid = await verifySessionToken(sessionCookie);
        if (isValid) {
          const session = decodeSessionPayload(sessionCookie);
          if (session?.userId) {
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
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while checking slug availability.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
