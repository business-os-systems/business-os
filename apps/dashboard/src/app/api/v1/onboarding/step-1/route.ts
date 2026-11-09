import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  encodeSessionPayload,
  signSessionToken,
  createSessionCookieOptions,
  type SessionPayload,
} from "@suite/auth/session";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import { quotaProblemResponse } from "@/lib/quota-problem";
import {
  bootstrapOrganization,
  getOnboardingOrganization,
} from "@/services/onboarding.service";

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
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const session = sessionResult.session;

    const data = await getOnboardingOrganization({
      userId: session.userId,
      sessionOrganizationId: session.organizationId,
    });
    return successResponse(data);
  } catch (error) {
    console.error("Error fetching onboarding step 1 data:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to retrieve existing organization data.",
    });
  }
}

async function buildBootstrapResponse(
  result: Extract<Awaited<ReturnType<typeof bootstrapOrganization>>, { status: "bootstrapped" }>,
  session: SessionPayload
): Promise<NextResponse> {
  const token = await signSessionToken(
    encodeSessionPayload({
      userId: session.userId,
      email: result.userEmail || session.email,
      userName: result.userName || session.userName,
      organizationId: result.organizationId,
      organizationName: result.organizationName,
      activeBranchId: result.branchId,
      activeBranchName: result.branchName,
      role: result.roleName,
      permissions: result.permissions,
      themePreference: session.themePreference ?? "system",
      timestamp: Date.now(),
      onboardingStatus: "IN_PROGRESS",
      currentOnboardingStep: 2,
    })
  );

  const cookieOptions = createSessionCookieOptions(isProduction, true);
  const response = successResponse({
    success: true,
    organizationId: result.organizationId,
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
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const session = sessionResult.session;

    const body = await request.json().catch(() => null);
    const parseResult = step1Schema.safeParse(body);
    if (!parseResult.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_ERROR",
        title: "Bad Request",
        detail: parseResult.error.errors[0]?.message || "Invalid input data",
      });
    }

    const result = await bootstrapOrganization({
      userId: session.userId,
      sessionOrganizationId: session.organizationId,
      organizationName: parseResult.data.organizationName,
      organizationSlug: parseResult.data.organizationSlug,
      industries: parseResult.data.industries,
    });

    if (result.status === "domain_taken") {
      return problemResponse({
        status: 409,
        code: "DOMAIN_TAKEN",
        title: "Conflict",
        detail: result.race
          ? "This workspace domain was just claimed by another organization. Please choose a different domain."
          : "Workspace domain is already taken. Please choose another domain.",
      });
    }

    return await buildBootstrapResponse(result, session);
  } catch (error) {
    const quotaProblem = quotaProblemResponse(error);
    if (quotaProblem) {
      return quotaProblem;
    }
    console.error("Error in onboarding step 1:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "Failed to create organization and initialize workspace.",
    });
  }
}
