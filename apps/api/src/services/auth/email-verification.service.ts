import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import {
  createEmailVerificationToken,
  decodeSessionPayload,
  sendEmail,
  verifyEmailToken,
} from "@suite/auth";
import { getDashboardUrl } from "../../lib/env.js";

const VERIFICATION_RATE_LIMIT_PREFIX = "ratelimit:verify-email";
const VERIFICATION_RATE_LIMIT_MAX = 5;
const VERIFICATION_RATE_LIMIT_WINDOW_SECONDS = 3600;
const VERIFICATION_CONFIRM_PATH = "/api/auth/verify-email/confirm";

export type EmailVerificationRequestResult =
  | { readonly status: "invalid-request" }
  | { readonly status: "accepted" }
  | { readonly status: "dispatched" }
  | { readonly status: "already-verified" }
  | { readonly status: "rate-limited" };

export interface EmailVerificationRequest {
  readonly sessionToken: string | null;
  readonly email?: string;
}

function readSessionEmail(sessionToken: string | null): string | undefined {
  if (sessionToken === null) {
    return undefined;
  }
  const payload = decodeSessionPayload(sessionToken);
  return payload?.email;
}

function resolveTargetEmail(input: EmailVerificationRequest): string | null {
  const sessionEmail = readSessionEmail(input.sessionToken);
  const hasSessionEmail =
    sessionEmail !== undefined && sessionEmail.length > 0;
  const candidate = hasSessionEmail ? sessionEmail : input.email;
  if (candidate === undefined || candidate.length === 0) {
    return null;
  }
  return candidate.toLowerCase().trim();
}

async function findVerificationAccount(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerified: true },
  });
}

/** The cache counter is best-effort: an outage must not block verification. */
async function allowVerificationRequest(email: string): Promise<boolean> {
  const rateLimitKey = `${VERIFICATION_RATE_LIMIT_PREFIX}:${email}`;
  try {
    const currentCount = await redis.incr(rateLimitKey);
    if (currentCount === 1) {
      await redis.expire(rateLimitKey, VERIFICATION_RATE_LIMIT_WINDOW_SECONDS);
    }
    return currentCount <= VERIFICATION_RATE_LIMIT_MAX;
  } catch {
    // Fail open on a cache outage; the database still enforces token validity.
    return true;
  }
}

function buildVerificationUrl(rawToken: string): string {
  return `${getDashboardUrl()}${VERIFICATION_CONFIRM_PATH}?token=${rawToken}`;
}

function verificationEmailContent(verificationUrl: string) {
  return {
    subject: "Verify your email address - Business OS",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1E1B19;">Verify your email address</h2>
        <p style="color: #5C504B; font-size: 15px; line-height: 1.5;">
          Thank you for joining Business OS. Click the button below to verify your email address and unlock full workspace access.
        </p>
        <div style="margin: 32px 0;">
          <a href="${verificationUrl}" style="background-color: #F87171; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #8C7B75; font-size: 13px;">
          This link is valid for 24 hours. If you did not create this account, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Verify your Business OS email address by visiting: ${verificationUrl}`,
  };
}

async function dispatchVerificationEmail(email: string): Promise<void> {
  const { rawToken } = await createEmailVerificationToken(email, prisma);
  const verificationUrl = buildVerificationUrl(rawToken);
  await sendEmail({
    to: email,
    ...verificationEmailContent(verificationUrl),
  });
}

export async function requestEmailVerification(
  input: EmailVerificationRequest
): Promise<EmailVerificationRequestResult> {
  const targetEmail = resolveTargetEmail(input);
  if (targetEmail === null) {
    return { status: "invalid-request" };
  }

  const account = await findVerificationAccount(targetEmail);
  if (account === null) {
    return { status: "accepted" };
  }
  if (account.emailVerified) {
    return { status: "already-verified" };
  }
  if (!(await allowVerificationRequest(targetEmail))) {
    return { status: "rate-limited" };
  }

  await dispatchVerificationEmail(targetEmail);
  return { status: "dispatched" };
}

export async function confirmEmailVerification(token: string) {
  return verifyEmailToken(token, prisma);
}
