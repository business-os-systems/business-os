import { ValidationError } from "../errors.js";
import type {
  OAuthExchangeParams,
  OAuthExchangeResult,
  OAuthUserProfile,
  OAuthTokenResult,
} from "./types.js";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  id: number | string;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

interface GitHubEmailItem {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface MicrosoftUserResponse {
  id: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
}

/**
 * Exchanges Google OAuth code for tokens and user profile.
 */
export async function exchangeGoogleCode(
  params: Omit<OAuthExchangeParams, "provider">,
): Promise<OAuthExchangeResult> {
  const fetcher = params.fetchFn ?? fetch;
  const clientId = params.clientId || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = params.clientSecret || process.env.GOOGLE_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new ValidationError("Missing Google OAuth client credentials (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET).");
  }

  // 1. Exchange authorization code for tokens
  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new ValidationError(
      `Google token exchange failed: ${tokenData.error_description || tokenData.error || "Unknown token error"}`,
    );
  }

  // 2. Fetch authenticated user profile
  const userinfoResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const userInfo = (await userinfoResponse.json()) as GoogleUserInfoResponse;
  if (!userinfoResponse.ok || !userInfo.sub || !userInfo.email) {
    throw new ValidationError("Failed to retrieve Google user profile information.");
  }

  const profile: OAuthUserProfile = {
    id: userInfo.sub,
    email: userInfo.email.toLowerCase().trim(),
    name: userInfo.name || userInfo.email.split("@")[0] || "Google User",
    image: userInfo.picture ?? null,
    emailVerified: userInfo.email_verified ?? true,
  };

  const tokens: OAuthTokenResult = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    idToken: tokenData.id_token ?? null,
    expiresIn: tokenData.expires_in ?? null,
    scope: tokenData.scope ?? null,
    tokenType: tokenData.token_type ?? "Bearer",
  };

  return {
    provider: "google",
    tokens,
    profile,
  };
}

/**
 * Exchanges GitHub OAuth code for tokens and user profile with verified email lookup.
 */
export async function exchangeGitHubCode(
  params: Omit<OAuthExchangeParams, "provider">,
): Promise<OAuthExchangeResult> {
  const fetcher = params.fetchFn ?? fetch;
  const clientId = params.clientId || process.env.GITHUB_CLIENT_ID || "";
  const clientSecret = params.clientSecret || process.env.GITHUB_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new ValidationError("Missing GitHub OAuth client credentials (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET).");
  }

  // 1. Exchange authorization code for token
  const tokenResponse = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
    }).toString(),
  });

  const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new ValidationError(
      `GitHub token exchange failed: ${tokenData.error_description || tokenData.error || "Unknown token error"}`,
    );
  }

  // 2. Fetch authenticated user profile
  const userResponse = await fetcher("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "Business-OS-Auth",
      Accept: "application/json",
    },
  });

  const userData = (await userResponse.json()) as GitHubUserResponse;
  if (!userResponse.ok || !userData.id) {
    throw new ValidationError("Failed to retrieve GitHub user profile information.");
  }

  // 3. Fetch user emails to locate primary verified email
  let resolvedEmail = userData.email?.toLowerCase().trim() || "";
  let isEmailVerified = Boolean(resolvedEmail);

  if (!resolvedEmail) {
    const emailsResponse = await fetcher("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "Business-OS-Auth",
        Accept: "application/json",
      },
    });

    if (emailsResponse.ok) {
      const emailsList = (await emailsResponse.json()) as GitHubEmailItem[];
      const primaryEmail = emailsList.find((e) => e.primary && e.verified) ?? emailsList.find((e) => e.verified) ?? emailsList[0];
      if (primaryEmail?.email) {
        resolvedEmail = primaryEmail.email.toLowerCase().trim();
        isEmailVerified = primaryEmail.verified;
      }
    }
  }

  if (!resolvedEmail) {
    throw new ValidationError("Unable to resolve a valid email address from your GitHub account.");
  }

  const profile: OAuthUserProfile = {
    id: String(userData.id),
    email: resolvedEmail,
    name: userData.name || userData.login || resolvedEmail.split("@")[0] || "GitHub User",
    image: userData.avatar_url ?? null,
    emailVerified: isEmailVerified,
  };

  const tokens: OAuthTokenResult = {
    accessToken: tokenData.access_token,
    refreshToken: null,
    idToken: null,
    expiresIn: null,
    scope: tokenData.scope ?? null,
    tokenType: tokenData.token_type ?? "Bearer",
  };

  return {
    provider: "github",
    tokens,
    profile,
  };
}

/**
 * Exchanges Microsoft Entra / 365 OAuth code for tokens and user profile.
 */
export async function exchangeMicrosoftCode(
  params: Omit<OAuthExchangeParams, "provider">,
): Promise<OAuthExchangeResult> {
  const fetcher = params.fetchFn ?? fetch;
  const clientId = params.clientId || process.env.MICROSOFT_CLIENT_ID || "";
  const clientSecret = params.clientSecret || process.env.MICROSOFT_CLIENT_SECRET || "";
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    throw new ValidationError("Missing Microsoft OAuth client credentials (MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET).");
  }

  // 1. Exchange authorization code for tokens
  const tokenResponse = await fetcher(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  const tokenData = (await tokenResponse.json()) as MicrosoftTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new ValidationError(
      `Microsoft token exchange failed: ${tokenData.error_description || tokenData.error || "Unknown token error"}`,
    );
  }

  // 2. Fetch authenticated user profile via Microsoft Graph
  const userinfoResponse = await fetcher("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  const userInfo = (await userinfoResponse.json()) as MicrosoftUserResponse;
  if (!userinfoResponse.ok || !userInfo.id) {
    throw new ValidationError("Failed to retrieve Microsoft user profile information.");
  }

  const resolvedEmail = (userInfo.mail || userInfo.userPrincipalName || "").toLowerCase().trim();
  if (!resolvedEmail) {
    throw new ValidationError("Unable to resolve a valid email address from your Microsoft account.");
  }

  const profile: OAuthUserProfile = {
    id: userInfo.id,
    email: resolvedEmail,
    name: userInfo.displayName || resolvedEmail.split("@")[0] || "Microsoft User",
    image: null,
    emailVerified: true,
  };

  const tokens: OAuthTokenResult = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    idToken: tokenData.id_token ?? null,
    expiresIn: tokenData.expires_in ?? null,
    scope: tokenData.scope ?? null,
    tokenType: tokenData.token_type ?? "Bearer",
  };

  return {
    provider: "microsoft",
    tokens,
    profile,
  };
}

/**
 * Dispatches code exchange to the requested OAuth provider.
 */
export async function exchangeOAuthCode(
  params: OAuthExchangeParams,
): Promise<OAuthExchangeResult> {
  switch (params.provider) {
    case "google":
      return exchangeGoogleCode(params);
    case "github":
      return exchangeGitHubCode(params);
    case "microsoft":
      return exchangeMicrosoftCode(params);
    default:
      throw new ValidationError(`Unsupported OAuth provider: "${params.provider}". Supported providers: google, github, microsoft.`);
  }
}

