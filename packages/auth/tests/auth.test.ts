import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  createAuth,
  createSessionCookieOptions,
  extractTokenFromHeader,
  extractTokenFromCookie,
  DEFAULT_SESSION_COOKIE_NAME,
} from "../src/index.js";

describe("Platform Core Auth Engine & Better-Auth Integration", () => {
  it("initializes createAuth factory with Prisma adapter and plugins", () => {
    const mockPrisma = {
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma),
    } as unknown as PrismaClient;

    const auth = createAuth(mockPrisma, {
      secret: "suite-test-super-secret-key-32-chars-long!",
      baseURL: "https://auth.business-os.com",
    });

    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
    expect(auth.options).toBeDefined();
    expect(auth.options.secret).toBe("suite-test-super-secret-key-32-chars-long!");
    expect(auth.options.baseURL).toBe("https://auth.business-os.com");
  });

  describe("Session Cookie Security Standards", () => {
    it("creates secure, HTTP-only, SameSite=lax cookie configuration", () => {
      const devCookies = createSessionCookieOptions(false);
      expect(devCookies.name).toBe(DEFAULT_SESSION_COOKIE_NAME);
      expect(devCookies.httpOnly).toBe(true);
      expect(devCookies.secure).toBe(false);
      expect(devCookies.sameSite).toBe("lax");
      expect(devCookies.path).toBe("/");
      expect(devCookies.maxAge).toBe(7 * 24 * 60 * 60);

      const prodCookies = createSessionCookieOptions(true);
      expect(prodCookies.httpOnly).toBe(true);
      expect(prodCookies.secure).toBe(true);
      expect(prodCookies.sameSite).toBe("lax");
    });
  });

  describe("Token Extractors", () => {
    it("extracts Bearer tokens correctly from Authorization header", () => {
      expect(extractTokenFromHeader("Bearer valid_session_token_xyz")).toBe(
        "valid_session_token_xyz"
      );
      expect(extractTokenFromHeader("bearer token_lowercase")).toBeNull();
      expect(extractTokenFromHeader("Basic YWxhZGRpbjpvcGVuc2VzYW1l")).toBeNull();
      expect(extractTokenFromHeader("")).toBeNull();
      expect(extractTokenFromHeader(null)).toBeNull();
      expect(extractTokenFromHeader(undefined)).toBeNull();
    });

    it("extracts session token from standard Cookie header", () => {
      const cookieStr = "theme=dark; suite_session=sess_tok_12345; lang=en";
      expect(extractTokenFromCookie(cookieStr)).toBe("sess_tok_12345");

      const customCookie = "my_custom=token_abc; other=val";
      expect(extractTokenFromCookie(customCookie, "my_custom")).toBe("token_abc");

      expect(extractTokenFromCookie("no_session_here=true")).toBeNull();
      expect(extractTokenFromCookie("")).toBeNull();
      expect(extractTokenFromCookie(null)).toBeNull();
    });
  });
});
