import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionCookieOptions } from "../src/session/session-token.js";

describe("Session Cookie Domain Scoping (createSessionCookieOptions)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SESSION_COOKIE_DOMAIN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("omits domain attribute by default for host-only security", () => {
    const options = createSessionCookieOptions(false);
    expect(options.domain).toBeUndefined();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
  });

  it("applies SESSION_COOKIE_DOMAIN when configured for parent domain", () => {
    process.env.SESSION_COOKIE_DOMAIN = ".rohitbahuguna.online";
    const options = createSessionCookieOptions(true);
    expect(options.domain).toBe(".rohitbahuguna.online");
    expect(options.secure).toBe(true);
  });

  it("ignores domain if set to localhost to prevent browser cookie drops", () => {
    process.env.SESSION_COOKIE_DOMAIN = "localhost";
    const options = createSessionCookieOptions(false);
    expect(options.domain).toBeUndefined();
  });

  it("respects explicit domainOverride parameter", () => {
    const options = createSessionCookieOptions(true, false, undefined, undefined, ".tenant.example.com");
    expect(options.domain).toBe(".tenant.example.com");
  });
});
