import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T183: a failed delivery is reported, never swallowed, and the report carries
 * no recipient and no single-use token (OP-11).
 */

const RECIPIENT = "undeliverable-379@example.test";
const TOKEN = "undeliverable-token-379";
const ORGANIZATION_ID = "org_delivery_379";

vi.mock("@suite/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          id: "usr_delivery_379",
          email: "undeliverable-379@example.test",
          emailVerified: false,
        })
      ),
    },
  },
}));

vi.mock("@suite/redis", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true, retryAfter: 0 })),
}));

vi.mock("@suite/auth", () => ({
  createEmailVerificationToken: vi.fn(() =>
    Promise.resolve({ rawToken: "undeliverable-token-379" })
  ),
  sendEmail: vi.fn(() => Promise.resolve({ success: false, messageId: "capture_379_failed" })),
  verifyEmailToken: vi.fn(),
}));

vi.mock("@suite/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { logger } from "@suite/logger";
import { sendEmail } from "@suite/auth";
import { requestEmailVerification } from "../src/services/email-verification.service";

describe("verification delivery failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the failed delivery without the recipient or the token", async () => {
    const result = await requestEmailVerification({
      email: RECIPIENT,
      origin: "http://journey.localhost:3101",
    });

    expect(result.status).toBe("accepted");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(sendEmail).mock.calls[0]?.[0];
    expect(payload?.html).toContain(TOKEN);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).toContain("email.verification.delivery_failed");
    expect(logged).toContain("capture_379_failed");
    expect(logged).not.toContain(RECIPIENT);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(ORGANIZATION_ID);
  });
});