import { describe, it, expect } from "vitest";
import {
  sanitizePii,
  isSensitiveKey,
  scrubStringValues,
  REDACTED_MARKER,
} from "../src/sanitize.js";

describe("Strict Zero-PII Sanitizer (@suite/logger)", () => {
  it("redacts sensitive keys regardless of case", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("PASSWORD")).toBe(true);
    expect(isSensitiveKey("token")).toBe(true);
    expect(isSensitiveKey("bearerToken")).toBe(true);
    expect(isSensitiveKey("sessionCookie")).toBe(true);
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("creditCardNumber")).toBe(true);
    expect(isSensitiveKey("organizationId")).toBe(false);
    expect(isSensitiveKey("routePath")).toBe(false);
  });

  it("replaces sensitive object values with REDACTED_MARKER", () => {
    const rawPayload = {
      userId: "usr_123",
      password: "SuperSecretPassword123!",
      sessionToken: "jwt.session.token.here",
      metadata: {
        authorization: "Bearer secret-api-key",
        pin: "1234",
        safeNote: "Valid diagnostic note",
      },
    };

    const sanitized = sanitizePii(rawPayload);

    expect(sanitized.userId).toBe("usr_123");
    expect(sanitized.password).toBe(REDACTED_MARKER);
    expect(sanitized.sessionToken).toBe(REDACTED_MARKER);
    expect(sanitized.metadata.authorization).toBe(REDACTED_MARKER);
    expect(sanitized.metadata.pin).toBe(REDACTED_MARKER);
    expect(sanitized.metadata.safeNote).toBe("Valid diagnostic note");
  });

  it("scrubs email addresses and phone numbers from freeform string values", () => {
    const errorWithPii = new Error(
      "Failed to process user john.doe@example.com with phone 123-456-7890."
    );

    const sanitized = sanitizePii(errorWithPii);

    expect(sanitized.message).not.toContain("john.doe@example.com");
    expect(sanitized.message).not.toContain("123-456-7890");
    expect(sanitized.message).toContain("[EMAIL_REDACTED]");
    expect(sanitized.message).toContain("[PHONE_REDACTED]");
  });

  it("scrubs the single-use bootstrap link token", () => {
    const scrubbed = scrubStringValues(
      "Open http://localhost:3002/sign-in#bootstrap=live-token-abc123"
    );

    expect(scrubbed).not.toContain("live-token-abc123");
  });

  it("safely handles circular references without infinite loops", () => {
    const circularObj: Record<string, unknown> = { name: "Test" };
    circularObj.self = circularObj;

    const sanitized = sanitizePii(circularObj);

    expect(sanitized.name).toBe("Test");
    expect(sanitized.self).toBe("[CIRCULAR]");
  });
});
