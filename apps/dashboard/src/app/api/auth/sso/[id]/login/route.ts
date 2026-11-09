import { NextRequest, NextResponse } from "next/server";
import { problemResponse } from "@/lib/api-response";
import { resolveRequestOrigin } from "@/lib/origin";
import { getSsoConnection } from "@/services/sso.service";

function wantsHtml(request: NextRequest): boolean {
  const acceptHeader = request.headers.get("accept") ?? "";
  return acceptHeader.includes("text/html");
}

function redirectToLogin(
  origin: string,
  errorCode: string,
  extraParams?: { readonly domain?: string; readonly organization?: string }
): NextResponse {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", errorCode);
  if (extraParams?.domain) {
    loginUrl.searchParams.set("domain", extraParams.domain);
  }
  if (extraParams?.organization) {
    loginUrl.searchParams.set("org", extraParams.organization);
  }
  return NextResponse.redirect(loginUrl);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const origin = resolveRequestOrigin(request);
    const connection = await getSsoConnection(id);

    if (!connection) {
      if (wantsHtml(request)) {
        return redirectToLogin(origin, "sso_not_found");
      }
      return problemResponse({
        type: "/errors/not-found",
        title: "Not Found",
        status: 404,
        detail: "SSO Connection not found.",
        code: "SSO_CONNECTION_NOT_FOUND",
      });
    }

    // An external IdP authorization URL is validated as credential-free HTTPS
    // by the service before it is used as a redirect target (SEC-03).
    if (connection.authUrl) {
      return NextResponse.redirect(new URL(connection.authUrl));
    }

    if (wantsHtml(request)) {
      return redirectToLogin(origin, "sso_unconfigured", {
        domain: connection.domain,
        organization: connection.organizationName,
      });
    }

    return problemResponse({
      type: "/errors/sso-unconfigured",
      title: "SSO Configuration Pending",
      status: 501,
      detail: `Enterprise Identity Provider for ${connection.organizationName} (${connection.domain}) is not yet configured with an active SAML 2.0 / OIDC endpoint. Please contact your workspace administrator or use standard password login.`,
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
