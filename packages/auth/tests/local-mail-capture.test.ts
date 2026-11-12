import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@suite/logger";
import {
  LOCAL_MAIL_CAPTURE_PROVIDER,
  LocalMailCaptureEmailTransporter,
  resolveEmailTransporter,
  resolveLocalMailCaptureDirectory,
  type CapturedEmailMessage,
} from "@suite/auth";

/**
 * T183 / N8: verification is usable outside production because the delivery
 * sink writes the link to a local mail drop. The token must reach the tester
 * through that file and never through the log (OP-11).
 */

const RECIPIENT = "journey-visitor@example.test";
const SUBJECT = "Verify your email address - Business OS";
const TOKEN = "single-use-verification-token-379";
const VERIFICATION_URL = "http://journey.localhost:3101/api/auth/verify-email/confirm?token=" + TOKEN;

const TEMPORARY_DIRECTORIES: string[] = [];

interface LogCapture {
  readonly stream: { write(message: string): void };
  raw: () => string;
}

function createLogCapture(): LogCapture {
  const chunks: string[] = [];
  return {
    stream: {
      write(message: string): void {
        chunks.push(message);
      },
    },
    raw: () => chunks.join(""),
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bos-mail-capture-"));
  TEMPORARY_DIRECTORIES.push(directory);
  return directory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The captured file is read back through a checked shape, never asserted. */
function readCapturedMessage(value: unknown): CapturedEmailMessage {
  if (
    !isRecord(value) ||
    typeof value.messageId !== "string" ||
    typeof value.to !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.html !== "string"
  ) {
    throw new Error("The captured mail file does not match the delivery contract.");
  }
  return {
    messageId: value.messageId,
    to: value.to,
    subject: value.subject,
    html: value.html,
    text: typeof value.text === "string" ? value.text : null,
    capturedAt: typeof value.capturedAt === "string" ? value.capturedAt : "",
  };
}

function createCaptureTransporter(directory: string, capture: LogCapture): LocalMailCaptureEmailTransporter {
  return new LocalMailCaptureEmailTransporter({
    directory,
    log: createLogger({ destination: capture.stream, pretty: false, level: "info" }),
  });
}

afterEach(async () => {
  await Promise.all(
    TEMPORARY_DIRECTORIES.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("local mail capture transporter", () => {
  it("writes the verification link to the mail drop", async () => {
    const directory = await createTemporaryDirectory();
    const capture = createLogCapture();
    const transporter = createCaptureTransporter(directory, capture);

    const result = await transporter.sendEmail({
      to: RECIPIENT,
      subject: SUBJECT,
      html: '<a href="' + VERIFICATION_URL + '">Verify</a>',
      text: "Visit " + VERIFICATION_URL,
      organizationId: "org_journey_capture",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    const stored = await readFile(join(directory, String(result.messageId) + ".json"), "utf8");
    const parsed: unknown = JSON.parse(stored);
    const message = readCapturedMessage(parsed);
    expect(message.to).toBe(RECIPIENT);
    expect(message.subject).toBe(SUBJECT);
    expect(message.html).toContain(VERIFICATION_URL);
    expect(message.text).toContain(VERIFICATION_URL);
  });

  it("stores the captured message owner-only", async () => {
    const directory = await createTemporaryDirectory();
    const transporter = createCaptureTransporter(directory, createLogCapture());

    const result = await transporter.sendEmail({
      to: RECIPIENT,
      subject: SUBJECT,
      html: VERIFICATION_URL,
    });

    const permissions = (await stat(join(directory, String(result.messageId) + ".json"))).mode;
    expect(permissions & 0o777).toBe(0o600);
  });

});

describe("local mail capture logging", () => {
  it("keeps the token and the recipient out of the log while reporting the drop path", async () => {
    const directory = await createTemporaryDirectory();
    const capture = createLogCapture();
    const transporter = createCaptureTransporter(directory, capture);

    await transporter.sendEmail({
      to: RECIPIENT,
      subject: SUBJECT,
      html: '<a href="' + VERIFICATION_URL + '">Verify</a>',
    });

    const logged = capture.raw();
    expect(logged).toContain("email.dispatch.capture");
    expect(logged).toContain(directory);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(RECIPIENT);
    expect(logged).not.toContain(SUBJECT);
  });

});

describe("local mail capture failure", () => {
  it("reports a failed capture instead of claiming delivery", async () => {
    const directory = await createTemporaryDirectory();
    const blockingFile = join(directory, "not-a-directory");
    await writeFile(blockingFile, "occupied", "utf8");
    const transporter = createCaptureTransporter(blockingFile, createLogCapture());

    const result = await transporter.sendEmail({
      to: RECIPIENT,
      subject: SUBJECT,
      html: VERIFICATION_URL,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("capture provider resolution", () => {
  it("resolves the capture sink when the provider is selected outside production", () => {
    vi.stubEnv("EMAIL_PROVIDER", LOCAL_MAIL_CAPTURE_PROVIDER);

    try {
      const transporter = resolveEmailTransporter();
      expect(transporter).toBeInstanceOf(LocalMailCaptureEmailTransporter);
      expect(transporter.id).toBe(LOCAL_MAIL_CAPTURE_PROVIDER);
      if (transporter instanceof LocalMailCaptureEmailTransporter) {
        expect(transporter.captureDirectory).toBe(resolveLocalMailCaptureDirectory());
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  /**
   * Production status is read once when the module loads, exactly as the app
   * reads it at boot, so this case loads the package a second time under a
   * production environment instead of mutating a constant.
   */
  it("refuses the capture sink in production instead of dropping mail", async () => {
    vi.stubEnv("EMAIL_PROVIDER", LOCAL_MAIL_CAPTURE_PROVIDER);
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    try {
      const productionAuth: typeof import("@suite/auth") = await import("@suite/auth");
      expect(() => productionAuth.resolveEmailTransporter()).toThrow(
        /not available in production/
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});