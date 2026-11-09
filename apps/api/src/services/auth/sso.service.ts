import { prisma } from "@suite/db";
import { resolveSsoProviderByEmail } from "@suite/auth";

export interface SsoLoginConnection {
  readonly authUrl: string | null;
  readonly domain: string;
  readonly organizationName: string;
}

/** Reads the IdP endpoint the login redirect may use; anything else is null. */
function readAuthUrl(config: unknown): string | null {
  if (typeof config !== "object" || config === null) {
    return null;
  }
  const candidate = (config as Record<string, unknown>).authUrl;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export async function discoverSsoProvider(email: string) {
  return resolveSsoProviderByEmail(email, prisma);
}

export async function findSsoLoginConnection(
  id: string
): Promise<SsoLoginConnection | null> {
  const record = await prisma.ssoConnection.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (record === null) {
    return null;
  }

  return {
    authUrl: readAuthUrl(record.config),
    domain: record.domain,
    organizationName: record.organization.name,
  };
}
