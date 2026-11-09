import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Compact, HMAC-signed support-session ticket.
 *
 * The ticket is verified only inside apps/api to prove which read-only support
 * session a tenant request belongs to. It is NOT a tenant session, is never
 * accepted as an authentication credential, and grants no tenant capability:
 * the tenant session still authenticates the caller and the capability check
 * still authorizes the action. The key is derived from CONTROL_SESSION_SECRET
 * with a distinct context string so a ticket can never be replayed as a
 * control session and vice versa.
 */
const TICKET_KEY_CONTEXT = "platform:impersonation:ticket";
const TICKET_SEPARATOR = ".";
const PAYLOAD_PARTS = 2;

export const impersonationTicketPayloadSchema = z
  .object({
    ticketId: z.string().uuid(),
    operatorId: z.string().min(1).max(191),
    organizationId: z.string().min(1).max(191),
    exp: z.number().int().positive(),
  })
  .strict();

export type ImpersonationTicketPayload = z.infer<
  typeof impersonationTicketPayloadSchema
>;

function deriveSigningKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(TICKET_KEY_CONTEXT)
    .digest();
}

function signEncodedPayload(key: Buffer, encodedPayload: string): Buffer {
  return createHmac("sha256", key).update(encodedPayload).digest();
}

export function signImpersonationTicket(
  secret: string,
  payload: ImpersonationTicketPayload
): string {
  const validated = impersonationTicketPayloadSchema.parse(payload);
  const encodedPayload = Buffer.from(
    JSON.stringify(validated),
    "utf8"
  ).toString("base64url");
  const signature = signEncodedPayload(
    deriveSigningKey(secret),
    encodedPayload
  ).toString("base64url");
  return `${encodedPayload}${TICKET_SEPARATOR}${signature}`;
}

function parsePayload(encodedPayload: string): unknown {
  try {
    return JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
}

interface TicketSegments {
  readonly encodedPayload: string;
  readonly signature: string;
}

function splitTicket(token: string): TicketSegments | null {
  const parts = token.split(TICKET_SEPARATOR);
  if (parts.length !== PAYLOAD_PARTS) {
    return null;
  }
  const [encodedPayload, signature] = parts;
  if (encodedPayload === undefined || encodedPayload.length === 0) {
    return null;
  }
  if (signature === undefined || signature.length === 0) {
    return null;
  }
  return { encodedPayload, signature };
}

function hasValidSignature(key: Buffer, segments: TicketSegments): boolean {
  const expectedSignature = signEncodedPayload(key, segments.encodedPayload);
  const providedSignature = Buffer.from(segments.signature, "base64url");
  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }
  return timingSafeEqual(providedSignature, expectedSignature);
}

/** Returns the payload only for an authentic, unexpired ticket. */
export function verifyImpersonationTicket(
  secret: string,
  token: string,
  nowMs: number = Date.now()
): ImpersonationTicketPayload | null {
  const segments = splitTicket(token);
  if (segments === null) {
    return null;
  }
  if (!hasValidSignature(deriveSigningKey(secret), segments)) {
    return null;
  }

  const parsed = impersonationTicketPayloadSchema.safeParse(
    parsePayload(segments.encodedPayload)
  );
  if (!parsed.success) {
    return null;
  }
  if (parsed.data.exp * 1000 <= nowMs) {
    return null;
  }
  return parsed.data;
}
