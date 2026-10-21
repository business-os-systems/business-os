import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as getTurnstileConfig } from "../src/app/api/auth/turnstile/config/route";

describe("Turnstile Runtime Configuration API (GET /api/auth/turnstile/config)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns unconfigured response when Turnstile keys are absent", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    const response = await getTurnstileConfig();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({
      siteKey: "",
      isConfigured: false,
    });
    expect(response.headers.get("Cache-Control")).toContain("public");
  });

  it("returns active site key when Turnstile is configured via NEXT_PUBLIC_TURNSTILE_SITE_KEY", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAATestSiteKey123";
    process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAATestSecretKey456";

    const response = await getTurnstileConfig();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({
      siteKey: "0x4AAAAAAATestSiteKey123",
      isConfigured: true,
    });
  });
});
