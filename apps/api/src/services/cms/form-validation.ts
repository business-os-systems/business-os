import { createHmac } from "node:crypto";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ValidationError } from "@suite/core/errors";
import {
  CMS_INQUIRY_ERROR,
  findSensitiveFieldNames,
  INQUIRY_PAYLOAD_MAX_BYTES,
  looksLikeEmail,
  payloadByteSize,
  type InquiryPayload,
} from "@suite/website-builder/inquiries";
import { getGdprHmacSalt } from "../../lib/env.js";

/**
 * Boundary validation for a public inquiry payload. A refusal names the field
 * that must not be collected; it never echoes the submitted value.
 */

export function assertInquiryPayloadWithinCap(payload: Record<string, unknown>): void {
  if (payloadByteSize(payload) <= INQUIRY_PAYLOAD_MAX_BYTES) {
    return;
  }
  throw new ValidationError(
    "The inquiry payload exceeds the 64KB limit.",
    [{ name: "payload", reason: "Send at most 64KB of form data." }],
    { code: CMS_INQUIRY_ERROR.PAYLOAD_TOO_LARGE }
  );
}

export function assertNoSensitiveFieldNames(payload: Record<string, unknown>): void {
  const sensitive = findSensitiveFieldNames(payload);
  if (sensitive.length === 0) {
    return;
  }
  throw new ValidationError(
    "Passwords, card details and one-time codes cannot be collected through an inquiry form.",
    sensitive.map((name) => ({
      name,
      reason: "Remove this field; secrets must never be stored as inquiry data.",
    })),
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
  );
}

/**
 * FR-044: a published form may not accept file attachments. The upload path
 * has no virus scan, type sniffing or size enforcement yet, so the honest
 * behaviour is an explicit refusal that names the field instead of storing an
 * unvalidated URL. A later release that adds those checks replaces this guard.
 */
export function assertNoInquiryAttachments(
  attachments: readonly InquiryPayload[]
): void {
  if (attachments.length === 0) {
    return;
  }
  throw new ValidationError(
    "Published forms do not accept file attachments.",
    [
      {
        name: "attachments",
        reason: "Remove the attachment; uploads are not accepted yet.",
      },
    ],
    { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
  );
}

function hashWithSalt(value: string): string {
  return createHmac("sha256", getGdprHmacSalt()).update(value).digest("hex");
}

export function hashSubmitterIdentity(clientIp: string, userAgent: string): string {
  return hashWithSalt("submitter:" + clientIp + "|" + userAgent);
}

export function hashInquiryEmail(email: string): string {
  return hashWithSalt("email:" + email.trim().toLowerCase());
}

/** Hashes an email only when it looks like one; never stores the raw value. */
export function hashEmailIfPresent(email: string | null): string | null {
  if (email === null || !looksLikeEmail(email)) {
    return null;
  }
  return hashInquiryEmail(email);
}
