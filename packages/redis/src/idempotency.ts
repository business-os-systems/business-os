import type { Redis } from "ioredis";
import { redis as defaultRedis } from "./client.js";

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const IDEMPOTENCY_PENDING_TTL_SECONDS = 60;
export const IDEMPOTENCY_KEY_PREFIX = "idempotency:";
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export interface IdempotentResponse {
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export type IdempotencyReservation =
  | { readonly status: "reserved" }
  | { readonly status: "pending" }
  | { readonly status: "completed"; readonly response: IdempotentResponse };

export interface IdempotencyStore {
  reserve(scope: string): Promise<IdempotencyReservation>;
  complete(scope: string, response: IdempotentResponse): Promise<void>;
  release(scope: string): Promise<void>;
}

function keyFor(scope: string): string {
  return `${IDEMPOTENCY_KEY_PREFIX}${scope}`;
}

function parseStoredResponse(raw: string): IdempotentResponse | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "status" in parsed &&
      "body" in parsed &&
      typeof parsed.status === "number" &&
      typeof parsed.body === "string"
    ) {
      return {
        status: parsed.status,
        body: parsed.body,
        headers: "headers" in parsed ? parseStoredHeaders(parsed.headers) : {},
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseStoredHeaders(value: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return headers;
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") headers[key] = headerValue;
  }
  return headers;
}

export function createIdempotencyStore(
  client: Redis = defaultRedis
): IdempotencyStore {
  return {
    async reserve(scope: string): Promise<IdempotencyReservation> {
      const key = keyFor(scope);
      const reserved = await client.set(
        key,
        "PENDING",
        "EX",
        IDEMPOTENCY_PENDING_TTL_SECONDS,
        "NX"
      );
      if (reserved === "OK") {
        return { status: "reserved" };
      }

      const raw = await client.get(key);
      if (raw === null) {
        return { status: "pending" };
      }
      if (raw === "PENDING") {
        return { status: "pending" };
      }
      const response = parseStoredResponse(raw);
      return response === null
        ? { status: "pending" }
        : { status: "completed", response };
    },

    async complete(
      scope: string,
      response: IdempotentResponse
    ): Promise<void> {
      await client.set(
        keyFor(scope),
        JSON.stringify(response),
        "EX",
        IDEMPOTENCY_TTL_SECONDS
      );
    },

    async release(scope: string): Promise<void> {
      await client.del(keyFor(scope));
    },
  };
}
