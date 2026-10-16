import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { oauthRegistry } from "@/lib/oauth-registry";
import { isProduction } from "@/lib/env";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> | { provider: string } },
): Promise<NextResponse> {
  const resolvedParams = await context.params;
  const providerId = resolvedParams.provider?.toLowerCase().trim();

  const providerDescriptor = oauthRegistry.get(providerId);
  if (!providerDescriptor || !providerDescriptor.enabled) {
    return NextResponse.json(
      {
        type: "/errors/provider-not-supported",
        title: "Not Found",
        status: 404,
        detail: `OAuth provider "${providerId}" is not supported or not enabled.`,
      },
      { status: 404, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  // 1. Generate cryptographically secure 32-byte CSRF state nonce
  const state = crypto.randomBytes(32).toString("hex");

  // 2. Resolve callback URL based on request origin or canonical app URL
  const origin =
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3001";
  const redirectUri = `${origin}/api/auth/callback/${providerId}`;

  // 3. Obtain provider authorization consent URL
  let authUrl: string;
  try {
    authUrl = providerDescriptor.getAuthUrl(redirectUri, state);
  } catch {
    // If provider credentials are unconfigured in environment, redirect cleanly
    return NextResponse.redirect(new URL("/login?error=sso_unconfigured", request.url), 302);
  }

  // 4. Return redirect with ephemeral 10-minute HTTP-only CSRF cookie
  const response = NextResponse.redirect(authUrl, { status: 302 });
  response.cookies.set({
    name: "oauth_state",
    value: state,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
