import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger, type Logger } from "@suite/logger";
import { isProduction } from "../env.js";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  organizationId?: string; // Extensible tenant scope for future custom SMTP
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Open-Closed Strategy interface for email dispatching.
 */
export interface EmailTransporter {
  readonly id: string;
  sendEmail(options: SendEmailOptions): Promise<EmailSendResult>;
}

/**
 * Minimal logging contract used by the transporters. Narrowing to a single
 * method keeps the email path free to log operational metadata while making
 * the zero-PII contract directly testable (OP-11).
 */
export type EmailDispatchLogger = Pick<Logger, "info">;

const CONSOLE_DISPATCH_EVENT = "email.dispatch.console";

/**
 * Default zero-config transporter for local development and deterministic CI tests.
 *
 * Logging contract: only the provider id, tenant scope, message id and payload
 * shape are logged. The recipient address, subject and body are never emitted,
 * because verification and reset emails carry single-use secrets (OP-11).
 */
export class ConsoleEmailTransporter implements EmailTransporter {
  readonly id = "console";
  private readonly log: EmailDispatchLogger;

  constructor(log: EmailDispatchLogger = logger) {
    this.log = log;
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const messageId = `console_${Date.now()}_${createHash("sha256")
      .update(options.to)
      .digest("hex")
      .slice(0, 8)}`;

    this.log.info(
      {
        transporter: this.id,
        organizationId: options.organizationId ?? null,
        messageId,
        hasPlainText: options.text !== undefined,
        htmlLength: options.html.length,
      },
      CONSOLE_DISPATCH_EVENT
    );

    return { success: true, messageId };
  }
}

/**
 * Local mail capture for non-production environments (T183, N8).
 *
 * The console transporter only reports that a message was dispatched, so a
 * tester who did not install an application during onboarding has no way to
 * follow a verification link. This sink writes each message to a local mail
 * drop instead: the tester reads the link out of the captured file and never
 * needs database access, a mail provider, or a console transcript.
 *
 * The drop lives under the operating system's temporary directory, so no path
 * is configured and no deployment can silently point it at a real inbox. The
 * log line carries the message id and the file path only; the recipient, the
 * subject and the body stay out of the log, and the single-use token exists
 * only inside the captured file (OP-11).
 *
 * The sink is registered outside production only. A production deployment that
 * sets EMAIL_PROVIDER=capture fails closed at resolution instead of dropping
 * every verification email on the floor.
 */
export const LOCAL_MAIL_CAPTURE_PROVIDER = "capture";
const LOCAL_MAIL_CAPTURE_DIRECTORY_NAME = "business-os-local-mail";
const CAPTURE_DISPATCH_EVENT = "email.dispatch.capture";

export interface CapturedEmailMessage {
  readonly messageId: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string | null;
  readonly capturedAt: string;
}

/** The default mail drop; the single definition shared by the sink and its readers. */
export function resolveLocalMailCaptureDirectory(): string {
  return join(tmpdir(), LOCAL_MAIL_CAPTURE_DIRECTORY_NAME);
}

export interface LocalMailCaptureOptions {
  readonly log?: EmailDispatchLogger;
  readonly directory?: string;
}

export class LocalMailCaptureEmailTransporter implements EmailTransporter {
  readonly id = LOCAL_MAIL_CAPTURE_PROVIDER;
  private readonly log: EmailDispatchLogger;
  private readonly directory: string;

  constructor(options: LocalMailCaptureOptions = {}) {
    this.log = options.log ?? logger;
    this.directory = options.directory ?? resolveLocalMailCaptureDirectory();
  }

  /** The directory this instance writes to, so a reader never guesses. */
  get captureDirectory(): string {
    return this.directory;
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const recipientHash = createHash("sha256").update(options.to).digest("hex").slice(0, 8);
    const messageId = "capture_" + String(Date.now()) + "_" + recipientHash;
    const capturePath = join(this.directory, messageId + ".json");
    const message: CapturedEmailMessage = {
      messageId,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? null,
      capturedAt: new Date().toISOString(),
    };

    try {
      // The message carries a single-use token, so the drop is private to the
      // operator running it: an owner-only directory and an owner-only file.
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(capturePath, JSON.stringify(message, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
    } catch (error: unknown) {
      return {
        success: false,
        messageId,
        error: error instanceof Error ? error.message : "Unknown error writing the local mail capture",
      };
    }

    this.log.info(
      {
        transporter: this.id,
        organizationId: options.organizationId ?? null,
        messageId,
        capturePath,
      },
      CAPTURE_DISPATCH_EVENT
    );

    return { success: true, messageId };
  }
}

/**
 * Production-ready Resend REST API transporter.
 */
export class ResendEmailTransporter implements EmailTransporter {
  readonly id = "resend";
  private apiKey: string;
  private defaultFrom: string;

  constructor(apiKey: string, defaultFrom = "Business OS <noreply@businessos.com>") {
    this.apiKey = apiKey;
    this.defaultFrom = defaultFrom;
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from || this.defaultFrom,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Resend API error: ${errorData}` };
      }

      const data = (await response.json()) as { id?: string };
      return { success: true, messageId: data.id };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error sending email via Resend",
      };
    }
  }
}

export type EmailTransporterFactory = () => EmailTransporter;

const TRANSPORTER_FACTORIES = new Map<string, EmailTransporterFactory>();

/**
 * Registers an email transporter factory dynamically into the open registry.
 * Enables zero-touch extensibility for any provider (SMTP, AWS SES, Postmark, etc.)
 * adhering strictly to the Open-Closed Principle (OCP).
 */
export function registerEmailTransporter(id: string, factory: EmailTransporterFactory): void {
  TRANSPORTER_FACTORIES.set(id.toLowerCase(), factory);
}

// Register default built-in providers into the dynamic registry
registerEmailTransporter("console", () => new ConsoleEmailTransporter());
registerEmailTransporter(LOCAL_MAIL_CAPTURE_PROVIDER, () => {
  if (isProduction) {
    throw new Error(
      "Critical Configuration Error: the local mail capture provider is not available in production."
    );
  }
  return new LocalMailCaptureEmailTransporter();
});
registerEmailTransporter("resend", () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && process.env.NODE_ENV === "production") {
    throw new Error(
      "Critical Configuration Error: RESEND_API_KEY is required when using the 'resend' email provider in production."
    );
  }
  return apiKey ? new ResendEmailTransporter(apiKey) : new ConsoleEmailTransporter();
});

/**
 * Resolves the active email transporter dynamically based on runtime environment configuration.
 * Uses O(1) registry lookup without static hardcoded provider branches or chained conditions.
 */
export function resolveEmailTransporter(): EmailTransporter {
  const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  const factory = TRANSPORTER_FACTORIES.get(provider);

  if (!factory) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Critical Configuration Error: Unsupported EMAIL_PROVIDER '${provider}' configured in production.`
      );
    }
    return new ConsoleEmailTransporter();
  }

  return factory();
}


/**
 * Unified dispatch helper accepting tenant scope for future BYO-SMTP extensibility.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const transporter = resolveEmailTransporter();
  return transporter.sendEmail(options);
}
