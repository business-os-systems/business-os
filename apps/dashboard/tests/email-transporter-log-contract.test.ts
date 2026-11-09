import { describe, it, expect } from "vitest";
import { createLogger } from "@suite/logger";
import { ConsoleEmailTransporter } from "@suite/auth";

/**
 * OP-11 logging contract for the default console email transporter: dispatch
 * telemetry may carry operational metadata, but never the recipient address,
 * subject or body of a verification or password-reset email.
 */

const RECIPIENT_ADDRESS = "recipient.pii@example.test";
const EMAIL_SUBJECT = "Reset your password for Acme";
const EMAIL_HTML = "<p>single-use-token-abc-123</p>";
const EMAIL_TEXT = "single-use-token-abc-123";
const ORGANIZATION_ID = "org_contract_1";

interface LogCapture {
  stream: { write(message: string): void };
  raw: () => string;
  entries: () => Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEntry(line: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(line);
  return isRecord(parsed) ? parsed : {};
}

function createLogCapture(): LogCapture {
  const chunks: string[] = [];
  const stream = {
    write(message: string): void {
      chunks.push(message);
    },
  };
  return {
    stream,
    raw: () => chunks.join(""),
    entries: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map(parseEntry),
  };
}

function createTransport(capture: LogCapture): ConsoleEmailTransporter {
  const log = createLogger({
    destination: capture.stream,
    pretty: false,
    level: "info",
  });
  return new ConsoleEmailTransporter(log);
}

describe("Console email transporter logging contract", () => {
  it("never logs the recipient, subject or body", async () => {
    const capture = createLogCapture();
    const transporter = createTransport(capture);

    const result = await transporter.sendEmail({
      to: RECIPIENT_ADDRESS,
      subject: EMAIL_SUBJECT,
      html: EMAIL_HTML,
      text: EMAIL_TEXT,
      organizationId: ORGANIZATION_ID,
    });

    const raw = capture.raw();
    expect(result.success).toBe(true);
    expect(raw).not.toContain(RECIPIENT_ADDRESS);
    expect(raw).not.toContain(EMAIL_SUBJECT);
    expect(raw).not.toContain(EMAIL_HTML);
    expect(raw).not.toContain(EMAIL_TEXT);
  });

});

describe("Console email structured log fields", () => {
  it("emits no address, subject or body fields in the structured entry", async () => {
    const capture = createLogCapture();
    const transporter = createTransport(capture);

    await transporter.sendEmail({
      to: RECIPIENT_ADDRESS,
      subject: EMAIL_SUBJECT,
      html: EMAIL_HTML,
      text: EMAIL_TEXT,
    });

    for (const entry of capture.entries()) {
      expect(entry.to).toBeUndefined();
      expect(entry.subject).toBeUndefined();
      expect(entry.html).toBeUndefined();
      expect(entry.text).toBeUndefined();
      expect(entry.email).toBeUndefined();
    }
  });

});

describe("Console email transporter correlation fields", () => {
  it("keeps tenant scope, message id and payload shape for correlation", async () => {
    const capture = createLogCapture();
    const transporter = createTransport(capture);

    const result = await transporter.sendEmail({
      to: RECIPIENT_ADDRESS,
      subject: EMAIL_SUBJECT,
      html: EMAIL_HTML,
      organizationId: ORGANIZATION_ID,
    });

    const raw = capture.raw();
    expect(raw).toContain("email.dispatch.console");
    expect(raw).toContain(ORGANIZATION_ID);
    expect(raw).toContain("console_");
    expect(result.messageId).toContain("console_");

    const [entry] = capture.entries();
    expect(entry?.transporter).toBe("console");
    expect(entry?.hasPlainText).toBe(false);
    expect(entry?.htmlLength).toBe(EMAIL_HTML.length);
  });
});