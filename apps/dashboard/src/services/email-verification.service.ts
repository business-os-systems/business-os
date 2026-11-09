import { checkRateLimit, enqueueEmail, type RateLimitRule } from "@suite/redis";
import { prisma } from "@suite/db";
import { createEmailVerificationToken, sendEmail, verifyEmailToken } from "@suite/auth";
import { RATE_LIMITS } from "@suite/core";

export type RequestEmailVerificationResult =
  | { readonly status: "accepted" }
  | { readonly status: "rate_limited"; readonly detail?: string; readonly retryAfter: number };

export type ConfirmEmailVerificationResult =
  | { readonly status: "verified"; readonly email: string }
  | { readonly status: "expired"; readonly email: string }
  | { readonly status: "invalid" };

function buildVerificationRules(email: string, clientIp?: string): RateLimitRule[] {
  const rules: RateLimitRule[] = [];
  if (clientIp) {
    rules.push({
      key: `ratelimit:verify-email:ip:${clientIp}`,
      max: RATE_LIMITS.MAX_VERIFY_EMAIL_PER_HOUR_IP,
      windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS,
    });
  }
  rules.push({
    key: `ratelimit:verify-email:${email}`,
    max: RATE_LIMITS.MAX_VERIFY_EMAIL_PER_HOUR_EMAIL,
    windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS,
  });
  return rules;
}

function buildVerificationEmail(email: string, rawToken: string, origin: string) {
  const verificationUrl = origin + "/api/auth/verify-email/confirm?token=" + rawToken;
  return {
    to: email,
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
    text: "Verify your Business OS email address by visiting: " + verificationUrl,
  };
}

async function dispatchVerificationEmail(
  email: string,
  rawToken: string,
  origin: string
): Promise<void> {
  const payload = buildVerificationEmail(email, rawToken, origin);
  try {
    await enqueueEmail(payload);
  } catch {
    await sendEmail(payload);
  }
}

export async function requestEmailVerification(input: {
  readonly email: string;
  readonly clientIp?: string;
  readonly origin: string;
}): Promise<RequestEmailVerificationResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, emailVerified: true },
  });

  // Never leak whether an address exists or is already verified (Issue 36).
  if (!user || user.emailVerified) {
    return { status: "accepted" };
  }

  const rateLimit = await checkRateLimit(buildVerificationRules(input.email, input.clientIp));
  if (!rateLimit.allowed) {
    return {
      status: "rate_limited",
      detail: rateLimit.detail,
      retryAfter: rateLimit.retryAfter,
    };
  }

  const { rawToken } = await createEmailVerificationToken(input.email, prisma);
  await dispatchVerificationEmail(input.email, rawToken, input.origin);
  return { status: "accepted" };
}

export async function confirmEmailVerification(
  token: string
): Promise<ConfirmEmailVerificationResult> {
  const result = await verifyEmailToken(token, prisma);
  if (result.success) {
    return { status: "verified", email: result.email };
  }
  if (result.reason === "EXPIRED") {
    return { status: "expired", email: result.email };
  }
  return { status: "invalid" };
}
