import { randomBytes } from "node:crypto";
import type { Redis } from "@suite/redis";
import { sha256Hex } from "../crypto/hmac.js";

export const BOOTSTRAP_TOKEN_TTL_SECONDS = 15 * 60;
export const BOOTSTRAP_TOKEN_PREFIX = "platform:bootstrap:";
export const BOOTSTRAP_OPERATOR_PREFIX = "platform:bootstrap:operator:";

const STORE_BOOTSTRAP_TOKEN_SCRIPT = `
local previous = redis.call('GET', KEYS[1])
if previous then
  redis.call('DEL', ARGV[1] .. previous)
end
redis.call('SET', ARGV[1] .. ARGV[2], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
return 1
`;

export interface BootstrapTokenPayload {
  readonly operatorId: string;
  readonly email: string;
}

export function createBootstrapToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashBootstrapToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function bootstrapTokenKey(tokenHash: string): string {
  return `${BOOTSTRAP_TOKEN_PREFIX}${tokenHash}`;
}

export function bootstrapOperatorKey(operatorId: string): string {
  return `${BOOTSTRAP_OPERATOR_PREFIX}${operatorId}`;
}

function parsePayload(raw: string): BootstrapTokenPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "operatorId" in value &&
      "email" in value &&
      typeof value.operatorId === "string" &&
      typeof value.email === "string"
    ) {
      return { operatorId: value.operatorId, email: value.email };
    }
    return null;
  } catch {
    return null;
  }
}

export interface StoreBootstrapTokenInput {
  readonly redis: Redis;
  readonly token: string;
  readonly payload: BootstrapTokenPayload;
}

export async function storeBootstrapToken(
  input: StoreBootstrapTokenInput
): Promise<void> {
  const tokenHash = await hashBootstrapToken(input.token);
  await input.redis.eval(
    STORE_BOOTSTRAP_TOKEN_SCRIPT,
    1,
    bootstrapOperatorKey(input.payload.operatorId),
    BOOTSTRAP_TOKEN_PREFIX,
    tokenHash,
    JSON.stringify(input.payload),
    String(BOOTSTRAP_TOKEN_TTL_SECONDS)
  );
}

export async function readBootstrapToken(
  redis: Redis,
  token: string
): Promise<BootstrapTokenPayload | null> {
  const tokenHash = await hashBootstrapToken(token);
  const raw = await redis.get(bootstrapTokenKey(tokenHash));
  return raw === null ? null : parsePayload(raw);
}

export async function consumeBootstrapToken(
  redis: Redis,
  token: string
): Promise<BootstrapTokenPayload | null> {
  const tokenHash = await hashBootstrapToken(token);
  const raw = await redis.getdel(bootstrapTokenKey(tokenHash));
  if (raw === null) return null;
  const payload = parsePayload(raw);
  if (payload !== null) {
    const operatorKey = bootstrapOperatorKey(payload.operatorId);
    if ((await redis.get(operatorKey)) === tokenHash) {
      await redis.del(operatorKey);
    }
  }
  return payload;
}
