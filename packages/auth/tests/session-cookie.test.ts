import { describe, expect, it, vi } from "vitest";
import {
  TENANT_SESSION_COOKIE_NAME,
  applyTenantSessionCookie,
  clearTenantSessionCookie,
  createTenantSessionCookieOptions,
  isTenantSessionHostBound,
  readTenantHostClaim,
} from "../src/session-cookie.js";
import { encodeBase64UrlText } from "../src/crypto/hmac.js";

function encodeToken(payload: Record<string, unknown>, kid?: string): string {
  const encoded = encodeBase64UrlText(JSON.stringify(payload));
  const target = kid === undefined ? encoded : kid + "." + encoded;
  return target + ".signature";
}

const HOTEL_HOST = "hotel.businessos.app";
const OTHER_HOST = "other.businessos.app";

function createSink() {
  return {
    cookies: {
      set: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("Tenant session cookie attributes (FR-111, T055)", () => {
  it("declares a __Host- name with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain", () => {
    const options = createTenantSessionCookieOptions(3600);

    expect(options.name).toBe(TENANT_SESSION_COOKIE_NAME);
    expect(options.name.startsWith("__Host-")).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(3600);
    expect(Object.keys(options)).not.toContain("domain");
  });

  it("refuses a non-positive or fractional max age instead of writing a weak cookie", () => {
    expect(() => createTenantSessionCookieOptions(0)).toThrow();
    expect(() => createTenantSessionCookieOptions(-1)).toThrow();
    expect(() => createTenantSessionCookieOptions(1.5)).toThrow();
  });

  it("writes and clears the cookie through the single sanctioned attribute set", () => {
    const sink = createSink();

    applyTenantSessionCookie(sink, "signed-token", 120);
    expect(sink.cookies.set).toHaveBeenCalledWith({
      name: TENANT_SESSION_COOKIE_NAME,
      value: "signed-token",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 120,
    });

    clearTenantSessionCookie(sink);
    expect(sink.cookies.delete).toHaveBeenCalledWith(TENANT_SESSION_COOKIE_NAME);
  });
});

describe("Tenant session host binding (FR-111, T090)", () => {
  it("accepts a session whose claim matches the requesting host", () => {
    expect(isTenantSessionHostBound(HOTEL_HOST, HOTEL_HOST)).toBe(true);
    expect(isTenantSessionHostBound("Hotel.BusinessOS.app", HOTEL_HOST)).toBe(true);
  });

  it("rejects the same session on any other host", () => {
    expect(isTenantSessionHostBound(HOTEL_HOST, OTHER_HOST)).toBe(false);
    expect(isTenantSessionHostBound(HOTEL_HOST, "businessos.com")).toBe(false);
    expect(isTenantSessionHostBound(HOTEL_HOST, "hotel.businessos.app.attacker.example")).toBe(false);
  });

  it("fails closed when a claimed session has no usable host", () => {
    expect(isTenantSessionHostBound(HOTEL_HOST, null)).toBe(false);
    expect(isTenantSessionHostBound(HOTEL_HOST, "")).toBe(false);
  });

  it("leaves a pre-migration session without a claim to the browser's host-only rule", () => {
    expect(isTenantSessionHostBound(undefined, HOTEL_HOST)).toBe(true);
  });

  it("reads the claim from both two- and three-segment tokens", () => {
    expect(readTenantHostClaim(encodeToken({ tenantHost: HOTEL_HOST }))).toBe(
      HOTEL_HOST
    );
    expect(readTenantHostClaim(encodeToken({ tenantHost: HOTEL_HOST }, "v1"))).toBe(
      HOTEL_HOST
    );
  });

  it("returns undefined for a token without a claim or with malformed content", () => {
    expect(readTenantHostClaim(encodeToken({ userId: "usr_1" }))).toBeUndefined();
    expect(readTenantHostClaim("not-a-token")).toBeUndefined();
    expect(readTenantHostClaim("")).toBeUndefined();
    expect(readTenantHostClaim("!!!.sig")).toBeUndefined();
  });
});