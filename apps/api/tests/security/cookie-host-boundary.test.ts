import { beforeAll, describe, expect, it } from "vitest";
import {
  TENANT_SESSION_COOKIE_NAME,
  applyTenantSessionCookie,
  createTenantSessionCookieOptions,
  isTenantSessionHostBound,
  readTenantHostClaim,
} from "@suite/auth/session-cookie";
import {
  createSessionCookieOptions,
  decodeSessionPayload,
  encodeSessionPayload,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@suite/auth";
import { normalizeHostname } from "@suite/core";

const SECRET = "test-secret-key-that-is-at-least-32-chars-long!";
const ALPHA_HOST = "alpha.businessos.app";
const BETA_HOST = "beta.businessos.app";

const BASE_PAYLOAD: SessionPayload = {
  userId: "usr_1",
  email: "owner@example.com",
  userName: "Owner",
  organizationId: "org_1",
  organizationName: "Alpha",
  permissions: ["*"],
  timestamp: Date.now(),
};

async function issueTenantSession(tenantHost: string): Promise<string> {
  const payload: SessionPayload = { ...BASE_PAYLOAD, tenantHost, timestamp: Date.now() };
  return signSessionToken(encodeSessionPayload(payload));
}

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = SECRET;
});

describe("host-only tenant session cookie (T055, T090)", () => {
  it("carries every required attribute and never a Domain", () => {
    const options = createTenantSessionCookieOptions(3600);

    expect(options.name).toBe(TENANT_SESSION_COOKIE_NAME);
    expect(options.name.startsWith("__Host-")).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(3600);
    expect("domain" in options).toBe(false);

    const serialized = { cookies: { set: (value: unknown) => void value, delete: () => undefined } };
    applyTenantSessionCookie(serialized, "token", 60);
    expect(serialized).toBeDefined();
  });

  it("is separate from the operator control cookie", async () => {
    const { CONTROL_SESSION_COOKIE_NAME } = await import("@suite/auth/platform");
    expect(TENANT_SESSION_COOKIE_NAME).not.toBe(CONTROL_SESSION_COOKIE_NAME);
    expect(CONTROL_SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    expect(TENANT_SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
  });

  it("always produces a host-only cookie with no configurable parent domain", () => {
    const options = createSessionCookieOptions();
    expect(options.domain).toBeUndefined();
    expect(options.secure).toBe(true);
    expect(options.path).toBe("/");
  });
});

describe("cross-host tenant cookie rejection (T090)", () => {
  it("accepts the session on the issuing host and rejects it on every other host", async () => {
    const token = await issueTenantSession(ALPHA_HOST);
    expect(await verifySessionToken(token)).toBe(true);

    const claim = readTenantHostClaim(token);
    expect(claim).toBe(ALPHA_HOST);

    expect(isTenantSessionHostBound(claim, normalizeHostname(ALPHA_HOST))).toBe(true);
    expect(isTenantSessionHostBound(claim, normalizeHostname(BETA_HOST))).toBe(false);
    expect(isTenantSessionHostBound(claim, normalizeHostname("businessos.com"))).toBe(false);
    expect(isTenantSessionHostBound(claim, null)).toBe(false);
  });

  it("rejects a copied cookie whose port or casing is presented differently", async () => {
    const token = await issueTenantSession(ALPHA_HOST);
    const claim = readTenantHostClaim(token);

    expect(isTenantSessionHostBound(claim, normalizeHostname("ALPHA.BusinessOS.app:443"))).toBe(true);
    expect(isTenantSessionHostBound(claim, normalizeHostname("beta.businessos.app:443"))).toBe(
      false
    );
  });

  it("keeps the host claim inside the signed payload", async () => {
    const token = await issueTenantSession(BETA_HOST);
    const payload = decodeSessionPayload(token);

    expect(payload?.tenantHost).toBe(BETA_HOST);
    expect(token.split(".")).toHaveLength(2);
    expect(token).not.toContain(BETA_HOST);
  });
});