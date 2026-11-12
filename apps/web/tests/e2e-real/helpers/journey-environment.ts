/**
 * Declarations shared by the real-API journey runner and its specs (#379).
 *
 * The ports and the tenant host root are declared once here so the config that
 * boots the three servers and the specs that drive them cannot drift apart. A
 * running development stack on 3001/3003/4000 is never reused: these ports are
 * dedicated to the journey.
 */

export const REAL_JOURNEY_PORTS = {
  api: 4100,
  dashboard: 3101,
  web: 3103,
} as const;

/** The declared tenant host root; the journey host is journey-<suffix>.<root>. */
export const REAL_JOURNEY_DOMAIN_ROOT = "localhost";

/**
 * The public host the create-site path provisions for a site address. The
 * visitor leg uses it, so the journey reads the site through the very host the
 * product issued rather than a fixture host.
 */
export function siteHostForAddress(address: string): string {
  return address + "." + REAL_JOURNEY_DOMAIN_ROOT;
}

export function apiOrigin(): string {
  return "http://127.0.0.1:" + String(REAL_JOURNEY_PORTS.api);
}

export function dashboardOrigin(tenantHost: string): string {
  return "http://" + tenantHost + ":" + String(REAL_JOURNEY_PORTS.dashboard);
}

export function storefrontOrigin(tenantHost: string): string {
  return "http://" + tenantHost + ":" + String(REAL_JOURNEY_PORTS.web);
}

/**
 * Reads a variable this project cannot run without. Every one is pre-declared
 * in .env.example; a missing value fails loudly instead of guessing a default.
 */
export function readRequiredJourneyEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(name + " must be declared to run the real-API journey.");
  }
  return value.trim();
}
