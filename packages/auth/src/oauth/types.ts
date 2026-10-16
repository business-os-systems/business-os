/**
 * Federated OAuth Domain Types (ISP)
 * Complies with SPEC-AUTH-001 Section 4.1.2.
 */

export interface OAuthUserProfile {
  id: string; // Provider-scoped subject/account ID
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  expiresIn?: number | null;
  scope?: string | null;
  tokenType?: string;
}

export interface OAuthExchangeResult {
  provider: string;
  tokens: OAuthTokenResult;
  profile: OAuthUserProfile;
}

export interface OAuthExchangeParams {
  provider: "google" | "github" | "microsoft" | string;
  code: string;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
  fetchFn?: typeof fetch;
}
