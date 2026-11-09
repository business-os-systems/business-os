import { prisma } from "@suite/db";
import {
  extractDomainFromEmail,
  isPublicEmailDomain,
  resolveSsoProviderByEmail,
} from "@suite/auth";

export interface SsoDiscoveryDto {
  readonly domain: string;
  readonly isEnterprise: boolean;
  readonly providerType: string | null;
  readonly organizationName: string | null;
  readonly ssoLoginUrl: string | null;
}

export interface SsoConnectionDto {
  readonly id: string;
  readonly domain: string;
  readonly organizationName: string;
  readonly authUrl?: string;
}

function publicDomainDiscovery(domain: string): SsoDiscoveryDto {
  return {
    domain,
    isEnterprise: false,
    providerType: null,
    organizationName: null,
    ssoLoginUrl: null,
  };
}

export async function discoverSsoProvider(email: string): Promise<SsoDiscoveryDto> {
  const domain = extractDomainFromEmail(email);
  if (isPublicEmailDomain(domain)) {
    return publicDomainDiscovery(domain);
  }

  const result = await resolveSsoProviderByEmail(email, prisma);
  if (!result || result.providerType === "internal_suite") {
    return publicDomainDiscovery(domain);
  }

  return {
    domain: result.domain,
    isEnterprise: true,
    providerType: result.providerType,
    organizationName: result.organizationName,
    ssoLoginUrl: result.authUrl,
  };
}

function readSafeAuthUrl(config: unknown): string | undefined {
  if (typeof config !== "object" || config === null || !("authUrl" in config)) {
    return undefined;
  }
  const rawAuthUrl = config.authUrl;
  if (typeof rawAuthUrl !== "string") {
    return undefined;
  }

  try {
    const targetUrl = new URL(rawAuthUrl);
    const isSafeRedirect =
      targetUrl.protocol === "https:" && !targetUrl.username && !targetUrl.password;
    return isSafeRedirect ? rawAuthUrl : undefined;
  } catch {
    return undefined;
  }
}

export async function getSsoConnection(id: string): Promise<SsoConnectionDto | null> {
  const connection = await prisma.ssoConnection.findUnique({
    where: { id },
    include: { organization: true },
  });
  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    domain: connection.domain,
    organizationName: connection.organization.name,
    authUrl: readSafeAuthUrl(connection.config),
  };
}
