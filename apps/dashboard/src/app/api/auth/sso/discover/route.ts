import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { discoverSsoProvider } from "@/services/sso.service";

const ssoDiscoverSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const parseResult = ssoDiscoverSchema.safeParse(body);

    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        code: "INVALID_EMAIL",
        detail: parseResult.error.errors[0]?.message || "Invalid email format for SSO discovery",
      });
    }

    const discovery = await discoverSsoProvider(parseResult.data.email);
    return successResponse({
      domain: discovery.domain,
      isEnterprise: discovery.isEnterprise,
      providerType: discovery.providerType,
      organizationName: discovery.organizationName,
      ssoLoginUrl: discovery.ssoLoginUrl,
    });
  } catch (error) {
    console.error("Error discovering SSO provider:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred during SSO domain discovery.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
