import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  verifyTurnstileToken,
  getTurnstileSiteKey,
  getTurnstileSecretKey,
  isTurnstileConfigured,
} from "../../src/lib/turnstile";

describe("Cloudflare Turnstile Verification (@suite/dashboard/lib/turnstile)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads keys dynamically from environment without hardcoded fallbacks", () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    expect(getTurnstileSiteKey()).toBe("");
    expect(getTurnstileSecretKey()).toBe("");
    expect(isTurnstileConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "env-site-key-123";
    process.env.TURNSTILE_SECRET_KEY = "env-secret-key-456";

    expect(getTurnstileSiteKey()).toBe("env-site-key-123");
    expect(getTurnstileSecretKey()).toBe("env-secret-key-456");
    expect(isTurnstileConfigured()).toBe(true);
  });

  it("rejects empty or missing token with missing-input-response error", async () => {
    const resNull = await verifyTurnstileToken(null);
    expect(resNull.success).toBe(false);
    expect(resNull.errorCodes).toContain("missing-input-response");

    const resEmpty = await verifyTurnstileToken("   ");
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.errorCodes).toContain("missing-input-response");
  });

  it("safely skips external verification when unconfigured in non-production", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const res = await verifyTurnstileToken("dummy-token");
    expect(res.success).toBe(true);
    expect(res.challengeTs).toBeDefined();
  });

  it("dispatches request to Cloudflare siteverify endpoint when configured", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key-abc";
    process.env.TURNSTILE_SECRET_KEY = "secret-key-xyz";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: "2026-10-20T12:00:00Z",
        hostname: "dashboard.business-os.dev",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await verifyTurnstileToken("valid-token-from-cf", "127.0.0.1");
    expect(res.success).toBe(true);
    expect(res.challengeTs).toBe("2026-10-20T12:00:00Z");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
  });

  it("propagates failure when Cloudflare siteverify rejects token", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key-abc";
    process.env.TURNSTILE_SECRET_KEY = "secret-key-xyz";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await verifyTurnstileToken("bad-token");
    expect(res.success).toBe(false);
    expect(res.errorCodes).toContain("invalid-input-response");
  });
});
