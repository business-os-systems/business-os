import { afterEach, describe, expect, it, vi } from "vitest";
import { getBetterAuthSecret } from "../src/lib/env.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dashboard signing secret", () => {
  it("refuses a published template value in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "business-os-enterprise-session-signing-secret-key-32ch-min"
    );

    expect(() => getBetterAuthSecret()).toThrow(/template/i);
  });

  it("accepts a generated secret in production", () => {
    const generated = "9f".repeat(24);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", generated);

    expect(getBetterAuthSecret()).toBe(generated);
  });

  it("keeps accepting the documented development secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "business-os-enterprise-session-signing-secret-key-32ch-min"
    );

    expect(getBetterAuthSecret()).toContain("business-os");
  });
});
