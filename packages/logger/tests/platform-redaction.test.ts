import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createLogger,
  DEFAULT_REDACT_PATHS,
  REDACT_CENSOR,
  scrubStringValues,
} from "../src/index.js";

const OPERATOR_EMAIL = "operator.person@example.com";
const SESSION_COOKIE = "bos_control_session=session-token-value-123";
const BOOTSTRAP_TOKEN = "bootstrap-token-value-456";
const WEBAUTHN_CHALLENGE = "webauthn-challenge-value-789";
const CREDENTIAL_ID = "credential-id-value-abc";

function createLogCaptureStream() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  return {
    stream,
    getLogs(): Record<string, unknown>[] {
      return chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    getRawOutput(): string {
      return chunks.join("");
    },
  };
}

/**
 * The Platform logging contract: structured records may carry the key but never
 * the value; free text is scrubbed before it reaches the logger.
 */
describe("@suite/logger - Platform logging contract", () => {
  it("declares every platform-sensitive key in the default redaction policy", () => {
    for (const path of [
      "email",
      "cookie",
      "bootstrapToken",
      "sessionToken",
      "challenge",
      "credentialId",
    ]) {
      expect(DEFAULT_REDACT_PATHS).toContain(path);
    }
  });

  it("redacts operator PII and session material from a platform record", () => {
    const { stream, getLogs } = createLogCaptureStream();
    const platformLogger = createLogger({ destination: stream, pretty: false });

    platformLogger.warn(
      {
        email: OPERATOR_EMAIL,
        operator: { email: OPERATOR_EMAIL },
        cookie: SESSION_COOKIE,
        headers: { cookie: SESSION_COOKIE },
        bootstrapToken: BOOTSTRAP_TOKEN,
        webauthn: {
          challenge: WEBAUTHN_CHALLENGE,
          credentialId: CREDENTIAL_ID,
        },
      },
      "Platform sign-in failed",
    );

    const [record] = getLogs();
    expect(record?.email).toBe(REDACT_CENSOR);
    expect(record?.cookie).toBe(REDACT_CENSOR);
    expect(record?.bootstrapToken).toBe(REDACT_CENSOR);
    expect(record?.operator).toEqual({ email: REDACT_CENSOR });
    expect(record?.headers).toEqual({ cookie: REDACT_CENSOR });
    expect(record?.webauthn).toEqual({
      challenge: REDACT_CENSOR,
      credentialId: REDACT_CENSOR,
    });
  });

  it("never serialises the raw values into the log output", () => {
    const { stream, getRawOutput } = createLogCaptureStream();
    const platformLogger = createLogger({ destination: stream, pretty: false });

    platformLogger.info(
      {
        email: OPERATOR_EMAIL,
        cookie: SESSION_COOKIE,
        bootstrapToken: BOOTSTRAP_TOKEN,
        webauthn: {
          challenge: WEBAUTHN_CHALLENGE,
          credentialId: CREDENTIAL_ID,
        },
      },
      "Platform operator signed in",
    );

    const output = getRawOutput();
    expect(output).not.toContain(OPERATOR_EMAIL);
    expect(output).not.toContain("session-token-value-123");
    expect(output).not.toContain(BOOTSTRAP_TOKEN);
    expect(output).not.toContain(WEBAUTHN_CHALLENGE);
    expect(output).not.toContain(CREDENTIAL_ID);
  });

  it("scrubs free-text operator identifiers before logging", () => {
    const scrubbed = scrubStringValues(
      `Operator ${OPERATOR_EMAIL} failed sign-in from +91 98765 43210`,
    );

    expect(scrubbed).not.toContain(OPERATOR_EMAIL);
    expect(scrubbed).not.toContain("98765 43210");
  });
});
