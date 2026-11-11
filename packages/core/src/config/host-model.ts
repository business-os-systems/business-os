/**
 * Host model configuration and classification (FR-109, FR-117).
 *
 * One declared domain root produces every tenant host. The marketing and
 * operator hosts are explicit configuration, so no runtime module contains a
 * hostname literal. A missing or malformed configuration classifies every host
 * as unknown, which the storefront answers with a neutral response.
 */

import {
  getTenantHostLabel,
  isReservedHostLabel,
  normalizeHostname,
} from "../constants/reserved.js";

export const HOST_ROLES = {
  MARKETING: "marketing",
  OPERATOR: "operator",
  TENANT: "tenant",
  UNKNOWN: "unknown",
} as const;

export type HostRole = (typeof HOST_ROLES)[keyof typeof HOST_ROLES];

/** Environment keys that drive the host model; every one is declared in .env.example. */
export const HOST_CONFIG_ENV_KEYS = [
  "DOMAIN_ROOT",
  "MARKETING_HOST",
  "OPERATOR_HOST",
] as const;

export type HostConfigEnvKey = (typeof HOST_CONFIG_ENV_KEYS)[number];

export interface HostModelEnv {
  readonly DOMAIN_ROOT?: string;
  readonly MARKETING_HOST?: string;
  readonly OPERATOR_HOST?: string;
}

export interface HostModelConfig {
  readonly tenantRootDomain: string | null;
  readonly marketingHost: string | null;
  readonly operatorHost: string | null;
}

export interface HostResolution {
  readonly role: HostRole;
  /** Normalized hostname, or null when the Host header was malformed. */
  readonly hostname: string | null;
  /** Tenant label for a tenant host; null for every other role. */
  readonly tenantLabel: string | null;
}

export interface HostResolutionInput {
  readonly hostHeader: string | null | undefined;
  readonly config: HostModelConfig;
}

export interface HeaderReader {
  get(name: string): string | null;
}

export interface RequestHostInput {
  readonly headers: HeaderReader;
  /** The parsed request URL host, used when no Host header is present. */
  readonly fallbackHost?: string | null;
}

/**
 * Reads the request host from the Host header first — the authority of the
 * HTTP request — then a proxy's x-forwarded-host, then the parsed request URL.
 * The forwarded header is only consulted when Host is absent, so a client
 * cannot override the authority by adding a header.
 */
export function readNormalizedRequestHost(input: RequestHostInput): string | null {
  const hostHeader = normalizeHostname(input.headers.get("host"));
  if (hostHeader !== null) {
    return hostHeader;
  }
  const forwarded = input.headers.get("x-forwarded-host");
  if (forwarded !== null && forwarded.trim().length > 0) {
    const forwardedHostname = normalizeHostname(forwarded.split(",")[0]?.trim());
    if (forwardedHostname !== null) {
      return forwardedHostname;
    }
  }
  return normalizeHostname(input.fallbackHost);
}

function readConfiguredHost(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return normalizeHostname(value);
}

function readProcessHostEnv(): HostModelEnv {
  return {
    DOMAIN_ROOT: process.env.DOMAIN_ROOT,
    MARKETING_HOST: process.env.MARKETING_HOST,
    OPERATOR_HOST: process.env.OPERATOR_HOST,
  };
}

/**
 * Reads the declared host model. Empty values stay null: an unconfigured root
 * is not silently replaced by a default (zero inline fallbacks).
 */
export function getHostModelConfig(env: HostModelEnv = readProcessHostEnv()): HostModelConfig {
  return {
    tenantRootDomain: readConfiguredHost(env.DOMAIN_ROOT),
    marketingHost: readConfiguredHost(env.MARKETING_HOST),
    operatorHost: readConfiguredHost(env.OPERATOR_HOST),
  };
}

function resolveTenantRole(
  hostname: string,
  tenantRootDomain: string | null
): HostResolution {
  if (tenantRootDomain === null) {
    return { role: HOST_ROLES.UNKNOWN, hostname, tenantLabel: null };
  }
  const label = getTenantHostLabel(hostname, tenantRootDomain);
  if (label === null || isReservedHostLabel(label)) {
    return { role: HOST_ROLES.UNKNOWN, hostname, tenantLabel: null };
  }
  return { role: HOST_ROLES.TENANT, hostname, tenantLabel: label };
}

/** Classifies a Host header into exactly one host role. */
export function resolveHost(input: HostResolutionInput): HostResolution {
  const hostname = normalizeHostname(input.hostHeader);
  if (hostname === null) {
    return { role: HOST_ROLES.UNKNOWN, hostname: null, tenantLabel: null };
  }
  if (hostname === input.config.marketingHost) {
    return { role: HOST_ROLES.MARKETING, hostname, tenantLabel: null };
  }
  if (hostname === input.config.operatorHost) {
    return { role: HOST_ROLES.OPERATOR, hostname, tenantLabel: null };
  }
  return resolveTenantRole(hostname, input.config.tenantRootDomain);
}

export function isTenantHostResolution(resolution: HostResolution): boolean {
  return resolution.role === HOST_ROLES.TENANT;
}