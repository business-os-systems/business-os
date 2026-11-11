import { describe, expect, it } from "vitest";
import {
  createSessionCookieOptions,
  DEFAULT_SESSION_COOKIE_NAME,
} from "../src/session/session-token.js";

/**
 * FR-111: a tenant session is host-only. There is no configuration that can
 * widen it to a parent domain; the cookie is __Host- prefixed and carries no
 * Domain attribute in any environment.
 */
describe("Host-only session cookie scoping (createSessionCookieOptions)", () => {
  it("never emits a Domain attribute and keeps every host-only attribute", () => {
    const options = createSessionCookieOptions(false);

    expect(options.domain).toBeUndefined();
    expect(options.name).toBe(DEFAULT_SESSION_COOKIE_NAME);
    expect(options.name.startsWith("__Host-")).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("keeps every host-only attribute in production", () => {
    const options = createSessionCookieOptions(true);
    expect(options.domain).toBeUndefined();
    expect(options.secure).toBe(true);
    expect(options.path).toBe("/");
  });

  it("honours an explicit max age without weakening the scope", () => {
    const options = createSessionCookieOptions(false, 3600);
    expect(options.maxAge).toBe(3600);
    expect(options.domain).toBeUndefined();
  });
});
