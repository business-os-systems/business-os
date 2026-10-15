/**
 * Extensible OAuth Provider Registry
 * Complies with SPEC-AUTH-001 Section 4.1.2 and Architecture Decision ADR-AUTH-002.
 * Adheres to the Open-Closed Principle: future providers (Apple, GitLab, etc.)
 * register descriptors without modifying core authentication gateway components.
 */

export interface OAuthProviderDescriptor {
  id: string;
  name: string;
  iconName: "google" | "microsoft" | "github" | "apple" | string;
  enabled: boolean;
  scopes: string[];
  getAuthUrl: (redirectUri: string, state: string) => string;
}

export class OAuthRegistry {
  private providers = new Map<string, OAuthProviderDescriptor>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    // 1. Google OAuth
    this.register({
      id: "google",
      name: "Google",
      iconName: "google",
      enabled: true,
      scopes: ["openid", "email", "profile"],
      getAuthUrl: (redirectUri: string, state: string) => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          throw new Error("Missing GOOGLE_CLIENT_ID environment variable");
        }
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid email profile",
          state,
          access_type: "offline",
          prompt: "select_account",
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      },
    });

    // 2. Microsoft Entra / 365 OAuth
    this.register({
      id: "microsoft",
      name: "Microsoft",
      iconName: "microsoft",
      enabled: true,
      scopes: ["openid", "email", "profile", "User.Read"],
      getAuthUrl: (redirectUri: string, state: string) => {
        const clientId = process.env.MICROSOFT_CLIENT_ID;
        if (!clientId) {
          throw new Error("Missing MICROSOFT_CLIENT_ID environment variable");
        }
        const tenant = process.env.MICROSOFT_TENANT_ID || "common";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid email profile User.Read",
          state,
          response_mode: "query",
        });
        return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
      },
    });

    // 3. GitHub OAuth
    this.register({
      id: "github",
      name: "GitHub",
      iconName: "github",
      enabled: true,
      scopes: ["read:user", "user:email"],
      getAuthUrl: (redirectUri: string, state: string) => {
        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) {
          throw new Error("Missing GITHUB_CLIENT_ID environment variable");
        }
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: "read:user user:email",
          state,
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
      },
    });
  }

  public register(provider: OAuthProviderDescriptor): void {
    this.providers.set(provider.id, provider);
  }

  public get(id: string): OAuthProviderDescriptor | undefined {
    return this.providers.get(id);
  }

  public getActiveProviders(): OAuthProviderDescriptor[] {
    return Array.from(this.providers.values()).filter((p) => p.enabled);
  }
}

// Global registry singleton
export const oauthRegistry = new OAuthRegistry();
