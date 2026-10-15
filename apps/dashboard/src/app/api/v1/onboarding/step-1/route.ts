import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
} from "@suite/auth/session";
import { isProduction } from "@/lib/env";
import { z } from "zod";

const step1Schema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must not exceed 100 characters"),
  organizationSlug: z
    .string()
    .trim()
    .min(2, "Workspace domain must be at least 2 characters")
    .max(100, "Workspace domain must not exceed 100 characters")
    .regex(/^[a-z0-9-]+$/, "Workspace domain must contain only lowercase letters, numbers, and hyphens"),
  industries: z
    .array(z.string().trim().min(1))
    .min(1, "Please select at least one industry domain"),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Active session is required to perform onboarding.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isValid = await verifySessionToken(sessionCookie);
    if (!isValid) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Session token signature is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const session = decodeSessionPayload(sessionCookie);
    if (!session || !session.userId) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Session token payload is invalid.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        organizations: {
          include: { organization: true },
        },
      },
    });

    const userMeta = (dbUser?.metadata || {}) as Record<string, unknown>;
    const targetOrgId =
      session.organizationId ||
      (userMeta.active_organization_id as string | undefined) ||
      dbUser?.organizations[0]?.organizationId;

    if (!targetOrgId) {
      return NextResponse.json({
        organizationName: "",
        organizationSlug: "",
        industries: [],
      });
    }

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
    });

    if (!org) {
      return NextResponse.json({
        organizationName: "",
        organizationSlug: "",
        industries: [],
      });
    }

    const orgMeta = (org.metadata || {}) as Record<string, unknown>;
    const industries = Array.isArray(orgMeta.industries)
      ? (orgMeta.industries as string[])
      : [];

    return NextResponse.json({
      organizationName: org.name,
      organizationSlug: org.slug,
      industries,
    });
  } catch (error) {
    console.error("Error fetching onboarding step 1 data:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Failed to retrieve existing organization data.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Active session is required to perform onboarding.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isValid = await verifySessionToken(sessionCookie);
    if (!isValid) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Session token signature is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const session = decodeSessionPayload(sessionCookie);
    if (!session || !session.userId) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Session token payload is invalid.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const body = await request.json().catch(() => null);
    const parseResult = step1Schema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.errors[0]?.message || "Invalid input data",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { organizationName, organizationSlug, industries } = parseResult.data;

    // Load user's already owned organizations
    const userOrgs = await prisma.userOrganization.findMany({
      where: { userId: session.userId },
      select: { organizationId: true },
    });
    const userOrgIds = new Set(userOrgs.map((uo) => uo.organizationId));
    if (session.organizationId) {
      userOrgIds.add(session.organizationId);
    }

    // Check slug collision against other tenants
    const existingOrgWithSlug = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true },
    });

    if (existingOrgWithSlug && !userOrgIds.has(existingOrgWithSlug.id)) {
      return NextResponse.json(
        {
          type: "/errors/domain-taken",
          title: "Conflict",
          status: 409,
          detail: "Workspace domain is already taken. Please choose another domain.",
          code: "DOMAIN_TAKEN",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Determine if updating an existing user org or creating fresh
    const targetExistingOrgId =
      (existingOrgWithSlug && userOrgIds.has(existingOrgWithSlug.id))
        ? existingOrgWithSlug.id
        : session.organizationId && userOrgIds.has(session.organizationId)
        ? session.organizationId
        : null;

    // Atomic tenant bootstrapping transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create or Update Organization
      let org;
      if (targetExistingOrgId) {
        org = await tx.organization.update({
          where: { id: targetExistingOrgId },
          data: {
            name: organizationName,
            slug: organizationSlug,
            metadata: { industries },
          },
        });
      } else {
        org = await tx.organization.create({
          data: {
            name: organizationName,
            slug: organizationSlug,
            metadata: { industries },
          },
        });
      }

      // 2. Auto-create or ensure default root branch (Minimalist Input Law)
      let branch = await tx.branch.findFirst({
        where: { organizationId: org.id, code: "MAIN" },
      });
      if (!branch) {
        branch = await tx.branch.create({
          data: {
            organizationId: org.id,
            name: "Main Location",
            code: "MAIN",
            type: "main",
          },
        });
      }

      // 3. Link user membership as ACTIVE Owner
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: {
            userId: session.userId,
            organizationId: org.id,
          },
        },
        create: {
          userId: session.userId,
          organizationId: org.id,
          status: "ACTIVE",
        },
        update: {
          status: "ACTIVE",
        },
      });

      // 4. Provision system "owner" role
      let ownerRole = await tx.role.findFirst({
        where: { organizationId: org.id, slug: "owner" },
      });
      if (!ownerRole) {
        ownerRole = await tx.role.create({
          data: {
            organizationId: org.id,
            name: "Organization Owner",
            slug: "owner",
            isSystem: true,
          },
        });
      }

      // 5. Grant organization-wide master owner role (branchId: null)
      const existingBranchRole = await tx.userBranchRole.findFirst({
        where: {
          userId: session.userId,
          organizationId: org.id,
          branchId: null,
          roleId: ownerRole.id,
        },
      });
      if (!existingBranchRole) {
        await tx.userBranchRole.create({
          data: {
            userId: session.userId,
            organizationId: org.id,
            branchId: null,
            roleId: ownerRole.id,
          },
        });
      }

      // 6. Advance onboarding state in user metadata
      const dbUser = await tx.user.findUnique({
        where: { id: session.userId },
        select: { metadata: true, email: true, name: true },
      });
      const currentMeta = (dbUser?.metadata || {}) as Record<string, unknown>;

      await tx.user.update({
        where: { id: session.userId },
        data: {
          metadata: {
            ...currentMeta,
            current_onboarding_step: 2,
            onboarding_status: "IN_PROGRESS",
            active_organization_id: org.id,
          },
        },
      });

      return { org, branch, dbUser };
    });

    // Re-issue updated session token with new organization context
    const updatedPayload = encodeSessionPayload({
      userId: session.userId,
      email: result.dbUser?.email || session.email,
      userName: result.dbUser?.name || session.userName,
      organizationId: result.org.id,
      organizationName: result.org.name,
      activeBranchId: result.branch.id,
      activeBranchName: result.branch.name,
      role: "owner",
      themePreference: session.themePreference || "system",
      timestamp: Date.now(),
      onboardingStatus: "IN_PROGRESS",
      currentOnboardingStep: 2,
    });

    const token = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = NextResponse.json({
      success: true,
      organizationId: result.org.id,
      nextStep: 2,
      redirectUrl: "/onboarding/step-2",
    });

    response.cookies.set({
      name: cookieOptions.name,
      value: token,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (error: unknown) {
    console.error("Error in onboarding step 1:", error);
    const err = error as { code?: string; message?: string };
    if (err?.code === "P2002" || err?.message?.includes("Unique constraint failed")) {
      return NextResponse.json(
        {
          type: "/errors/domain-taken",
          title: "Conflict",
          status: 409,
          detail: "This workspace domain was just claimed by another organization. Please choose a different domain.",
          code: "DOMAIN_TAKEN",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "Failed to create organization and initialize workspace.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
