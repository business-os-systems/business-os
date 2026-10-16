import { describe, it, expect, vi } from "vitest";
import {
  exchangeGoogleCode,
  exchangeGitHubCode,
  exchangeMicrosoftCode,
  exchangeOAuthCode,
} from "../src/oauth/index.js";

describe("Federated OAuth Token Exchange (@suite/auth)", () => {
  describe("exchangeGoogleCode", () => {
    it("successfully exchanges authorization code for tokens and Google profile", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              access_token: "google_mock_access_token_123",
              refresh_token: "google_mock_refresh_token_456",
              id_token: "google_mock_id_token_789",
              expires_in: 3600,
              token_type: "Bearer",
              scope: "openid email profile",
            }),
          });
        }
        if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              sub: "google_sub_9999",
              email: "alex.operator@gmail.com",
              name: "Alex Operator",
              picture: "https://lh3.googleusercontent.com/avatar.jpg",
              email_verified: true,
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      });

      const result = await exchangeGoogleCode({
        code: "mock_auth_code",
        redirectUri: "http://localhost:3001/api/auth/callback/google",
        clientId: "mock_client_id",
        clientSecret: "mock_client_secret",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.provider).toBe("google");
      expect(result.tokens.accessToken).toBe("google_mock_access_token_123");
      expect(result.tokens.refreshToken).toBe("google_mock_refresh_token_456");
      expect(result.profile.id).toBe("google_sub_9999");
      expect(result.profile.email).toBe("alex.operator@gmail.com");
      expect(result.profile.name).toBe("Alex Operator");
      expect(result.profile.emailVerified).toBe(true);
    });

    it("throws ValidationError when token exchange endpoint fails", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "invalid_grant",
          error_description: "Code has expired",
        }),
      });

      await expect(
        exchangeGoogleCode({
          code: "expired_code",
          redirectUri: "http://localhost:3001/api/auth/callback/google",
          clientId: "mock_id",
          clientSecret: "mock_secret",
          fetchFn: mockFetch as unknown as typeof fetch,
        }),
      ).rejects.toThrow(/Google token exchange failed/);
    });
  });

  describe("exchangeGitHubCode", () => {
    it("successfully exchanges authorization code and fetches primary verified email", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url === "https://github.com/login/oauth/access_token") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              access_token: "github_mock_token_abc",
              token_type: "bearer",
              scope: "read:user user:email",
            }),
          });
        }
        if (url === "https://api.github.com/user") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 1234567,
              login: "alexoperator",
              name: "Alex Dev",
              avatar_url: "https://avatars.githubusercontent.com/u/1234567",
              email: null, // Public email hidden on GitHub
            }),
          });
        }
        if (url === "https://api.github.com/user/emails") {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { email: "secondary@example.com", primary: false, verified: true },
              { email: "alex.dev@github.com", primary: true, verified: true },
            ],
          });
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      });

      const result = await exchangeGitHubCode({
        code: "mock_gh_code",
        redirectUri: "http://localhost:3001/api/auth/callback/github",
        clientId: "gh_client_id",
        clientSecret: "gh_client_secret",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.provider).toBe("github");
      expect(result.tokens.accessToken).toBe("github_mock_token_abc");
      expect(result.profile.id).toBe("1234567");
      expect(result.profile.email).toBe("alex.dev@github.com");
      expect(result.profile.name).toBe("Alex Dev");
      expect(result.profile.emailVerified).toBe(true);
    });
  });

  describe("exchangeMicrosoftCode", () => {
    it("successfully exchanges authorization code for tokens and Microsoft profile", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url === "https://login.microsoftonline.com/common/oauth2/v2.0/token") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              access_token: "ms_mock_access_token_xyz",
              refresh_token: "ms_mock_refresh_token_uvw",
              id_token: "ms_mock_id_token",
              expires_in: 3600,
              token_type: "Bearer",
              scope: "openid email profile User.Read",
            }),
          });
        }
        if (url === "https://graph.microsoft.com/v1.0/me") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: "ms_guid_12345",
              displayName: "Morgan Stanley",
              mail: "morgan.stanley@outlook.com",
              userPrincipalName: "morgan.stanley@outlook.com",
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      });

      const result = await exchangeMicrosoftCode({
        code: "mock_ms_code",
        redirectUri: "http://localhost:3001/api/auth/callback/microsoft",
        clientId: "ms_client_id",
        clientSecret: "ms_client_secret",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.provider).toBe("microsoft");
      expect(result.tokens.accessToken).toBe("ms_mock_access_token_xyz");
      expect(result.profile.id).toBe("ms_guid_12345");
      expect(result.profile.email).toBe("morgan.stanley@outlook.com");
      expect(result.profile.name).toBe("Morgan Stanley");
      expect(result.profile.emailVerified).toBe(true);
    });
  });

  describe("exchangeOAuthCode dispatcher", () => {
    it("throws ValidationError for unsupported provider", async () => {
      await expect(
        exchangeOAuthCode({
          provider: "unsupported_idp",
          code: "123",
          redirectUri: "http://localhost:3001",
        }),
      ).rejects.toThrow(/Unsupported OAuth provider/);
    });
  });
});

