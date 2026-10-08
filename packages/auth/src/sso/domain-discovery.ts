import type { PrismaClient } from "@suite/db";
import { ValidationError } from "@suite/core/errors";

export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
]);

export interface SsoDiscoveryResult {
  domain: string;
  providerType: string | null;
  enforceSso: boolean;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  authUrl: string | null;
  defaultRoleId?: string | null;
}

/**
 * Extracts and normalizes the domain from an email address.
 */
export function extractDomainFromEmail(email: string): string {
  if (!email || typeof email !== "string") {
    throw new ValidationError("Email must be a non-empty string", [
      { name: "email", reason: "Email must be a non-empty string" },
    ]);
  }

  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[1] || !parts[1].includes(".")) {
    throw new ValidationError("Invalid email format for SSO domain resolution", [
      { name: "email", reason: "Invalid email domain format" },
    ]);
  }

  return parts[1];
}

/**
 * Determines whether a given domain belongs to a consumer public email provider.
 */
export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Resolves enterprise Identity Provider (IdP) configuration from a user's corporate email domain.
 *
 * @param email The user's input email address.
 * @param prisma The database client.
 * @param baseUrl Optional base API URL to construct IdP redirect endpoints.
 * @returns Discovery result or null if domain does not belong to an enterprise SSO tenant.
 */
export async function resolveSsoProviderByEmail(
  email: string,
  prisma: PrismaClient,
  baseUrl = ""
): Promise<SsoDiscoveryResult | null> {
  const domain = extractDomainFromEmail(email);

  // Consumer email addresses (e.g. @gmail.com) use native Suite credentials or social login
  if (isPublicEmailDomain(domain)) {
    return {
      domain,
      providerType: "internal_suite",
      enforceSso: false,
      organizationId: null,
      organizationName: null,
      organizationSlug: null,
      authUrl: null,
      defaultRoleId: null,
    };
  }

  // Look up enterprise SSO connection for this corporate domain
  const ssoRecord = await prisma.ssoConnection.findUnique({
    where: { domain },
    include: {
      organization: true,
    },
  });

  if (!ssoRecord) {
    return null;
  }

  const authUrl = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/api/v1/auth/sso/${ssoRecord.id}/login`
    : `/api/v1/auth/sso/${ssoRecord.id}/login`;

  return {
    domain: ssoRecord.domain,
    providerType: ssoRecord.providerType,
    enforceSso: ssoRecord.enforceSso,
    organizationId: ssoRecord.organizationId,
    organizationName: ssoRecord.organization.name,
    organizationSlug: ssoRecord.organization.slug,
    authUrl,
    defaultRoleId: ssoRecord.defaultRoleId,
  };
}
