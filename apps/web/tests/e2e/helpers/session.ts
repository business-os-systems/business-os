import type { BrowserContext } from "@playwright/test";
import {
  TENANT_SESSION_COOKIE_NAME,
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "@suite/auth";
import { PERMISSIONS } from "@suite/core";

/** A tenant session that is valid only for the local release-gate host. */
export const RELEASE_GATE_HOST = "acme.localhost";
export const DASHBOARD_ORIGIN = "http://" + RELEASE_GATE_HOST + ":3001";
export const FIXTURE_ORGANIZATION_ID = "org_release_gates";

const RELEASE_GATE_PERMISSIONS: readonly string[] = [
  PERMISSIONS.CORE.ORGANIZATION_READ,
  PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
  PERMISSIONS.WEBSITE_BUILDER.PAGES_READ,
  PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE,
  PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW,
  PERMISSIONS.WEBSITE_BUILDER.PUBLISH,
  PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  PERMISSIONS.WEBSITE_BUILDER.LEADS_PII,
  PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE,
];

export function buildReleaseGateSession(now: number): SessionPayload {
  return {
    userId: "usr_release_gates",
    email: "release-gates@example.test",
    userName: "Release Gates",
    organizationId: FIXTURE_ORGANIZATION_ID,
    organizationName: "Northwind Studio Test Tenant",
    role: "release-gate-operator",
    permissions: [...RELEASE_GATE_PERMISSIONS],
    onboardingStatus: "COMPLETED",
    tenantHost: RELEASE_GATE_HOST,
    timestamp: now,
    issuedAt: now,
    expiresAt: now + 60 * 60 * 1000,
    isEphemeral: false,
  };
}

export async function installTenantSession(context: BrowserContext): Promise<void> {
  const payload = buildReleaseGateSession(Date.now());
  const token = await signSessionToken(encodeSessionPayload(payload));
  await context.addCookies([
    {
      name: TENANT_SESSION_COOKIE_NAME,
      value: token,
      domain: RELEASE_GATE_HOST,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}
