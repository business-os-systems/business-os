import { afterEach, describe, expect, it, vi } from "vitest";
import { FormService } from "../src/index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("form submission email hashing (SCR-109)", () => {
  it("refuses to hash an email without a configured salt", async () => {
    vi.stubEnv("GDPR_HMAC_SALT_KEY", "");
    const service = new FormService();

    await expect(
      service.submitForm({
        siteId: "site_salt",
        blockId: "block_salt",
        idempotencyKey: "salt-key-1",
        payload: { email: "person@example.com" },
        turnstileToken: "valid-turnstile-token",
      })
    ).rejects.toThrow(/GDPR_HMAC_SALT_KEY/);
  });
});
