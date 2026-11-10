import { randomBytes } from "node:crypto";
import type { Redis } from "@suite/redis";
import { sha256Hex } from "../crypto/hmac.js";

/**
 * Add-passkey enrolment token (T181).
 *
 * An authenticated ACTIVE operator exchanges this token for one WebAuthn
 * registration ceremony, so a second passkey can be added without creating an
 * INVITED operator or walking the invitation path. The token is short-lived,
 * single-use and bound to the issuing operator. Only its SHA-256 hash is
 * stored; a new token for the same operator revokes the previous one.
 */

export const ENROLMENT_TOKEN_TTL_SECONDS = 10 * 60;
export const ENROLMENT_TOKEN_PREFIX = "platform:enrolment:token:";
export const ENROLMENT_OPERATOR_PREFIX = "platform:enrolment:operator:";
const ENROLMENT_TOKEN_BYTES = 32;

const STORE_ENROLMENT_TOKEN_SCRIPT = `
local previous = redis.call('GET', KEYS[1])
if previous then
  redis.call('DEL', ARGV[1] .. previous)
end
redis.call('SET', ARGV[1] .. ARGV[2], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
return 1
`;

export interface EnrolmentTokenPayload {
  readonly operatorId: string;
}

export function createEnrolmentToken(): string {
  return randomBytes(ENROLMENT_TOKEN_BYTES).toString("base64url");
}

export function hashEnrolmentToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function enrolmentTokenKey(tokenHash: string): string {
  return `${ENROLMENT_TOKEN_PREFIX}${tokenHash}`;
}

export function enrolmentOperatorKey(operatorId: string): string {
  return `${ENROLMENT_OPERATOR_PREFIX}${operatorId}`;
}

function parsePayload(raw: string): EnrolmentTokenPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "operatorId" in value &&
      typeof value.operatorId === "string"
    ) {
      return { operatorId: value.operatorId };
    }
    return null;
  } catch {
    return null;
  }
}

export interface StoreEnrolmentTokenInput {
  readonly redis: Redis;
  readonly token: string;
  readonly payload: EnrolmentTokenPayload;
}

export async function storeEnrolmentToken(
  input: StoreEnrolmentTokenInput
): Promise<void> {
  const tokenHash = await hashEnrolmentToken(input.token);
  await input.redis.eval(
    STORE_ENROLMENT_TOKEN_SCRIPT,
    1,
    enrolmentOperatorKey(input.payload.operatorId),
    ENROLMENT_TOKEN_PREFIX,
    tokenHash,
    JSON.stringify(input.payload),
    String(ENROLMENT_TOKEN_TTL_SECONDS)
  );
}

export async function readEnrolmentToken(
  redis: Redis,
  token: string
): Promise<EnrolmentTokenPayload | null> {
  const tokenHash = await hashEnrolmentToken(token);
  const raw = await redis.get(enrolmentTokenKey(tokenHash));
  return raw === null ? null : parsePayload(raw);
}

/**
 * Atomically consumes the token. The caller must treat a null result as a
 * replay or an expired token; exactly one concurrent finish can succeed.
 */
export async function consumeEnrolmentToken(
  redis: Redis,
  token: string
): Promise<EnrolmentTokenPayload | null> {
  const tokenHash = await hashEnrolmentToken(token);
  const raw = await redis.getdel(enrolmentTokenKey(tokenHash));
  if (raw === null) return null;
  const payload = parsePayload(raw);
  if (payload !== null) {
    const operatorKey = enrolmentOperatorKey(payload.operatorId);
    if ((await redis.get(operatorKey)) === tokenHash) {
      await redis.del(operatorKey);
    }
  }
  return payload;
}
