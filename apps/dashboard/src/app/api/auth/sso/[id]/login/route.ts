import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { problemResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const ssoRecord = await prisma.ssoConnection.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!ssoRecord) {
      const acceptHeader = request.headers.get("accept") || "";
      if (acceptHeader.includes("text/html")) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("error", "sso_not_found");
        return NextResponse.redirect(loginUrl);
      }

      return problemResponse({
        type: "/errors/not-found",
        title: "Not Found",
        status: 404,
        detail: "SSO Connection not found.",
        code: "SSO_CONNECTION_NOT_FOUND",
      });
    }

    // If an external IdP authorization URL is configured, validate and redirect to it (SEC-03)
    const ssoConfig = ssoRecord.config as Record<string, unknown> | null;
    if (ssoConfig?.authUrl && typeof ssoConfig.authUrl === "string") {
      try {
        const targetUrl = new URL(ssoConfig.authUrl);
        if (targetUrl.protocol === "https:" && !targetUrl.username && !targetUrl.password) {
          return NextResponse.redirect(targetUrl);
        }
      } catch {
        // Malformed URL falls through to unconfigured error handling
      }
    }


    // Browser navigation fallback: redirect back to /login with friendly error message
    const acceptHeader = request.headers.get("accept") || "";
    if (acceptHeader.includes("text/html")) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "sso_unconfigured");
      loginUrl.searchParams.set("domain", ssoRecord.domain);
      loginUrl.searchParams.set("org", ssoRecord.organization.name);
      return NextResponse.redirect(loginUrl);
    }

    // Enterprise IdP must be configured to execute authentication (RFC 7807 for API callers)
    return problemResponse({
      type: "/errors/sso-unconfigured",
      title: "SSO Configuration Pending",
      status: 501,
      detail: `Enterprise Identity Provider for ${ssoRecord.organization.name} (${ssoRecord.domain}) is not yet configured with an active SAML 2.0 / OIDC endpoint. Please contact your workspace administrator or use standard password login.`,
      code: "SSO_IDP_NOT_CONFIGURED",
    });
  } catch (error) {
    console.error("Error executing SSO login flow:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred during SSO authentication.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
