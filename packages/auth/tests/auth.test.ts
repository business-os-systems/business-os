import { describe, it, expect, beforeAll } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  createAuth,
  createSessionCookieOptions,
  extractTokenFromHeader,
  extractTokenFromCookie,
  DEFAULT_SESSION_COOKIE_NAME,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  encodeSessionPayload,
  decodeSessionPayload,
  type SessionPayload,
} from "../src/index.js";

describe("Platform Core Auth Engine & Better-Auth Integration", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = "suite-test-super-secret-key-32-chars-long!";
  });

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
      expect(devCookies.maxAge).toBe(SESSION_EPHEMERAL_MAX_AGE_SECONDS);

      const prodCookies = createSessionCookieOptions(true);
      expect(prodCookies.httpOnly).toBe(true);
      expect(prodCookies.secure).toBe(true);
      expect(prodCookies.sameSite).toBe("lax");
    });

    it("respects ephemeral (24h) vs persistent (30d) vs custom expiration timeouts", () => {
      const ephemeral = createSessionCookieOptions(false, false);
      expect(ephemeral.maxAge).toBe(SESSION_EPHEMERAL_MAX_AGE_SECONDS);

      const persistent = createSessionCookieOptions(false, true);
      expect(persistent.maxAge).toBe(SESSION_PERSISTENT_MAX_AGE_SECONDS);

      const customTimeout = createSessionCookieOptions(false, false, 7200);
      expect(customTimeout.maxAge).toBe(7200);
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

  describe("Cryptographic Session Token Signing & Payload Encoding", () => {
    const samplePayload: SessionPayload = {
      userId: "usr_clx987654321",
      email: "operator@enterprise.com",
      organizationId: "org_alpha_01",
      organizationName: "Alpha Enterprises",
      role: "owner",
      userName: "Alex Mercer",
      timestamp: 1700000000000,
      themePreference: "dark",
    };

    it("encodes and decodes session payload roundtrip cleanly", () => {
      const encoded = encodeSessionPayload(samplePayload);
      expect(encoded).toBeTypeOf("string");

      const decoded = decodeSessionPayload(`${encoded}.fakesig`);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(samplePayload.userId);
      expect(decoded?.email).toBe(samplePayload.email);
      expect(decoded?.organizationId).toBe(samplePayload.organizationId);
      expect(decoded?.role).toBe(samplePayload.role);
      expect(decoded?.themePreference).toBe("dark");
    });

    it("signs session token with HMAC-SHA256 and verifies successfully", async () => {
      const encoded = encodeSessionPayload(samplePayload);
      const token = await signSessionToken(encoded);

      expect(token).toContain(".");
      const isValid = await verifySessionToken(token);
      expect(isValid).toBe(true);
    });

    it("rejects tampered signatures or modified payloads", async () => {
      const encoded = encodeSessionPayload(samplePayload);
      const token = await signSessionToken(encoded);

      const parts = token.split(".");
      const tamperedToken = `${parts[0]}.badsignature123`;
      expect(await verifySessionToken(tamperedToken)).toBe(false);

      const tamperedPayload = `${encoded}tampered.${parts[1]}`;
      expect(await verifySessionToken(tamperedPayload)).toBe(false);

      expect(await verifySessionToken("malformed-token")).toBe(false);
      expect(await verifySessionToken("")).toBe(false);
    });
  });

  describe("Environment Configuration Helper (@suite/auth/env)", () => {
    it("reads BETTER_AUTH_SECRET without static fallbacks", async () => {
      const { getBetterAuthSecret, isProduction, isTest } = await import("../src/env.js");
      expect(isTest).toBe(true);
      expect(isProduction).toBe(false);

      process.env.BETTER_AUTH_SECRET = "super-secret-auth-key-32-chars-long";
      expect(getBetterAuthSecret()).toBe("super-secret-auth-key-32-chars-long");
    });

    it("throws an explicit error when BETTER_AUTH_SECRET is unset", async () => {
      const { getBetterAuthSecret } = await import("../src/env.js");
      const originalSecret = process.env.BETTER_AUTH_SECRET;
      delete process.env.BETTER_AUTH_SECRET;

      expect(() => getBetterAuthSecret()).toThrow("BETTER_AUTH_SECRET environment variable is required");

      process.env.BETTER_AUTH_SECRET = originalSecret;
    });
  });

  describe("Argon2id Password Hashing & Complexity Validation", () => {
    it("validates password complexity (8+ chars, uppercase, number, symbol)", async () => {
      const { validatePasswordComplexity } = await import("../src/index.js");

      const weak1 = validatePasswordComplexity("short");
      expect(weak1.isValid).toBe(false);
      expect(weak1.hasMinLength).toBe(false);

      const weak2 = validatePasswordComplexity("lowercaseonly123!");
      expect(weak2.isValid).toBe(false);
      expect(weak2.hasUppercase).toBe(false);

      const weak3 = validatePasswordComplexity("NoNumberHere!");
      expect(weak3.isValid).toBe(false);
      expect(weak3.hasNumber).toBe(false);

      const weak4 = validatePasswordComplexity("NoSymbol1234");
      expect(weak4.isValid).toBe(false);
      expect(weak4.hasSpecialSymbol).toBe(false);

      const strong = validatePasswordComplexity("StrongP@ssw0rd");
      expect(strong.isValid).toBe(true);
      expect(strong.score).toBe(4);
    });

    it("hashes password with Argon2id and verifies match", async () => {
      const { hashPassword, verifyPassword } = await import("../src/index.js");

      const raw = "SuperS3cret!Password";
      const hashed = await hashPassword(raw);

      expect(hashed).toBeTypeOf("string");
      expect(hashed.startsWith("$argon2id$")).toBe(true);

      const isMatch = await verifyPassword(raw, hashed);
      expect(isMatch).toBe(true);

      const isMismatch = await verifyPassword("WrongPassword123!", hashed);
      expect(isMismatch).toBe(false);
    });

    it("rejects empty or invalid arguments", async () => {
      const { hashPassword, verifyPassword } = await import("../src/index.js");

      await expect(hashPassword("")).rejects.toThrow();
      expect(await verifyPassword("", "somehash")).toBe(false);
      expect(await verifyPassword("password", "")).toBe(false);
    });
  });

  describe("Versioned Tokens (SEC-05) & Key Rotation Support", () => {
    it("signs and verifies tokens with key version identifier (kid)", async () => {
      const samplePayload: SessionPayload = {
        userId: "usr_v1",
        email: "v1@company.com",
        userName: "V1 User",
        timestamp: Date.now(),
      };
      const encoded = encodeSessionPayload(samplePayload);
      const versionedToken = await signSessionToken(encoded, { kid: "v1" });

      expect(versionedToken.startsWith("v1.")).toBe(true);
      expect(versionedToken.split(".").length).toBe(3);

      const isValid = await verifySessionToken(versionedToken);
      expect(isValid).toBe(true);

      const decoded = decodeSessionPayload(versionedToken);
      expect(decoded?.userId).toBe("usr_v1");
      expect(decoded?.email).toBe("v1@company.com");
    });
  });

  describe("User Onboarding State Domain Helper (CODE-03 & CODE-04)", () => {
    it("safely parses raw JSON metadata with fallbacks", async () => {
      const { getUserOnboardingState, ONBOARDING_STATUS } = await import("../src/index.js");

      const state1 = getUserOnboardingState(null);
      expect(state1.onboardingStatus).toBe(ONBOARDING_STATUS.NOT_STARTED);
      expect(state1.currentOnboardingStep).toBeNull();
      expect(state1.themePreference).toBe("system");

      const state2 = getUserOnboardingState({
        onboarding_status: "IN_PROGRESS",
        current_onboarding_step: 2,
        theme_preference: "dark",
        active_organization_id: "org_123",
        selected_apps: ["restaurant_pos"],
      });
      expect(state2.onboardingStatus).toBe(ONBOARDING_STATUS.IN_PROGRESS);
      expect(state2.currentOnboardingStep).toBe(2);
      expect(state2.themePreference).toBe("dark");
      expect(state2.activeOrganizationId).toBe("org_123");
      expect(state2.selectedApps).toEqual(["restaurant_pos"]);
    });

    it("merges updated onboarding state without corrupting base metadata", async () => {
      const { mergeUserOnboardingState, ONBOARDING_STATUS } = await import("../src/index.js");

      const base = { custom_field: "preserve_me", onboarding_status: "NOT_STARTED" };
      const merged = mergeUserOnboardingState(base, {
        onboardingStatus: ONBOARDING_STATUS.COMPLETED,
        currentOnboardingStep: null,
      });

      expect(merged.custom_field).toBe("preserve_me");
      expect(merged.onboarding_status).toBe("COMPLETED");
      expect(merged.current_onboarding_step).toBeNull();
    });
  });

  describe("Shared Permission Aggregation (CODE-02)", () => {
    it("extracts and dedupes effective permissions across branch roles", async () => {
      const { extractEffectivePermissions } = await import("../src/index.js");

      const branchRoles = [
        {
          branchId: null,
          role: {
            permissions: [
              { permission: { action: "core:org:read" } },
              { permission: { action: "apps:install" } },
            ],
          },
        },
        {
          branchId: "branch_alpha",
          role: {
            permissions: [
              { permission: { action: "apps:install" } },
              { permission: { action: "restaurant_pos:orders:create" } },
            ],
          },
        },
      ];

      const allPerms = extractEffectivePermissions(branchRoles);
      expect(allPerms).toContain("core:org:read");
      expect(allPerms).toContain("apps:install");
      expect(allPerms).toContain("restaurant_pos:orders:create");
      expect(allPerms.filter((p) => p === "apps:install").length).toBe(1);

      // Scoped to specific branch
      const scopedPerms = extractEffectivePermissions(branchRoles, { branchId: "branch_alpha" });
      expect(scopedPerms).toContain("core:org:read"); // null branch included
      expect(scopedPerms).toContain("restaurant_pos:orders:create");
    });
  });
});


