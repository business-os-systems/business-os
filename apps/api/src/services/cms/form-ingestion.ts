import { NotFoundError } from "@suite/core/errors";
import {
  createInquiry,
  extractContactFields,
  INQUIRY_RETENTION_DAYS,
  INQUIRY_SPAM_VERDICT,
  INQUIRY_STATUS,
  resolvePublicSiteOrganization,
  type InquiryPayload,
  type InquirySpamVerdict,
  type InquiryStatus,
} from "@suite/website-builder/inquiries";
import { getTurnstileSecret, isProduction } from "../../lib/env.js";
import {
  DOMAIN_OPERATIONS,
  measureDomainOperation,
} from "../admin/domain-metrics.service.js";
import {
  assertInquiryPayloadWithinCap,
  assertNoInquiryAttachments,
  assertNoSensitiveFieldNames,
  hashEmailIfPresent,
  hashSubmitterIdentity,
} from "./form-validation.js";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TEST_TURNSTILE_TOKEN = "valid-turnstile-token";

export interface PublicSubmissionInput {
  readonly siteId: string;
  readonly blockId: string;
  readonly idempotencyKey: string;
  readonly payload: InquiryPayload;
  readonly attachments: readonly InquiryPayload[];
  readonly turnstileToken: string | null;
  readonly honeypot: string | null;
  readonly clientIp: string;
  readonly userAgent: string;
}

export interface PublicSubmissionResult {
  readonly inquiryId: string;
  readonly receivedAt: string;
  readonly duplicate: boolean;
}

interface SpamVerdict {
  readonly status: InquiryStatus;
  readonly verdict: InquirySpamVerdict | null;
}

/**
 * The visitor never learns which check failed (FR-046): a tripped honeypot and
 * a failed challenge both resolve to a quarantined SPAM record and the same
 * accepted response.
 */
async function assessBotVerdict(input: PublicSubmissionInput): Promise<SpamVerdict> {
  if (input.honeypot !== null && input.honeypot.trim().length > 0) {
    return { status: INQUIRY_STATUS.SPAM, verdict: INQUIRY_SPAM_VERDICT.HONEYPOT };
  }
  const passed = await verifyChallenge(input.turnstileToken);
  if (passed) {
    return { status: INQUIRY_STATUS.NEW, verdict: null };
  }
  return { status: INQUIRY_STATUS.SPAM, verdict: INQUIRY_SPAM_VERDICT.CHALLENGE };
}

function isTurnstileSuccess(outcome: unknown): boolean {
  return (
    typeof outcome === "object" &&
    outcome !== null &&
    "success" in outcome &&
    outcome.success === true
  );
}

async function verifyWithTurnstile(token: string, secret: string): Promise<boolean> {
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    return isTurnstileSuccess(await response.json());
  } catch (error: unknown) {
    console.error(
      "Turnstile verification failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

async function verifyChallenge(token: string | null): Promise<boolean> {
  if (token === null || token.trim().length === 0) {
    return false;
  }
  if (!isProduction && token === TEST_TURNSTILE_TOKEN) {
    return true;
  }
  const secret = getTurnstileSecret();
  // Fail closed: without the secret the challenge cannot be verified, so the
  // submission is quarantined rather than admitted.
  return secret === null ? false : verifyWithTurnstile(token, secret);
}

function retentionDeadline(now: Date): Date {
  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + INQUIRY_RETENTION_DAYS);
  return deadline;
}

/**
 * Captures one public submission. No notification is sent anywhere in this
 * path: the durable inquiry and its event are the only side effects (FR-138).
 */
export async function ingestPublicSubmission(
  input: PublicSubmissionInput
): Promise<PublicSubmissionResult> {
  return measureDomainOperation(
    DOMAIN_OPERATIONS.FORM_INGESTION,
    { siteId: input.siteId, blockId: input.blockId },
    async () => {
      assertNoInquiryAttachments(input.attachments);
      assertInquiryPayloadWithinCap(input.payload);
      assertNoSensitiveFieldNames(input.payload);
      const organizationId = await resolvePublicSiteOrganization(input.siteId);
      if (organizationId === null) {
        throw new NotFoundError("The requested site is not available.", { code: "NOT_FOUND" });
      }
      const spam = await assessBotVerdict(input);
      const contact = extractContactFields(input.payload);
      const result = await createInquiry({
        organizationId,
        siteId: input.siteId,
        blockId: input.blockId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        attachments: [...input.attachments],
        status: spam.status,
        spamVerdict: spam.verdict,
        emailHash: hashEmailIfPresent(contact.email),
        submitterHash: hashSubmitterIdentity(input.clientIp, input.userAgent),
        retentionExpiresAt: retentionDeadline(new Date()),
      });
      return {
        inquiryId: result.record.id,
        receivedAt: result.record.createdAt.toISOString(),
        duplicate: result.isDuplicate,
      };
    }
  );
}
