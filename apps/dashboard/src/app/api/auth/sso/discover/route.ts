import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import {
  resolveSsoProviderByEmail,
  extractDomainFromEmail,
  isPublicEmailDomain,
} from "@suite/auth";
import { z } from "zod";

const ssoDiscoverSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const parseResult = ssoDiscoverSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.errors[0]?.message || "Invalid email format for SSO discovery",
          code: "INVALID_EMAIL",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { email } = parseResult.data;
    const domain = extractDomainFromEmail(email);

    if (isPublicEmailDomain(domain)) {
      return NextResponse.json({
        domain,
        isEnterprise: false,
        providerType: null,
        organizationName: null,
        ssoLoginUrl: null,
      });
    }

    const result = await resolveSsoProviderByEmail(email, prisma);

    if (!result || result.providerType === "internal_suite") {
      return NextResponse.json({
        domain,
        isEnterprise: false,
        providerType: null,
        organizationName: null,
        ssoLoginUrl: null,
      });
    }

    return NextResponse.json({
      domain: result.domain,
      isEnterprise: true,
      providerType: result.providerType,
      organizationName: result.organizationName,
      ssoLoginUrl: result.authUrl,
    });
  } catch (error) {
    console.error("Error discovering SSO provider:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred during SSO domain discovery.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
