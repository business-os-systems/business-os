import { createHash } from "node:crypto";
import { logger, type Logger } from "@suite/logger";

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
