import { afterEach, describe, expect, it, vi } from "vitest";
import { getTurnstileSecretKey } from "../src/lib/turnstile.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Turnstile secret guard (SCR-108)", () => {
  it("refuses the published test secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");

    expect(() => getTurnstileSecretKey()).toThrow(/template/i);
  });

  it("accepts a generated secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAA-generated-secret");

    expect(getTurnstileSecretKey()).toBe("0x4AAAAAAA-generated-secret");
  });

  it("keeps the development test key usable outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");

    expect(getTurnstileSecretKey()).toBe(
      "1x0000000000000000000000000000000AA"
    );
  });
});
