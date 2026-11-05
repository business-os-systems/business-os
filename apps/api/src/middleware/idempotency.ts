import type { MiddlewareHandler } from "hono";
import type { Redis } from "@suite/redis";
import {
  IDEMPOTENCY_HEADER,
  createIdempotencyStore,
  type IdempotencyReservation,
} from "@suite/redis";
import {
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
} from "@suite/core/errors";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export interface IdempotencyMiddlewareOptions {
  readonly redis: Redis;
}

function idempotencyScope(
  operatorId: string,
  method: string,
  path: string,
  key: string
): string {
  return `${operatorId}:${method}:${path}:${key}`;
}

/**
 * Requires Idempotency-Key, reserves it in Redis, replays a stored response on a
 * repeat, and rejects a concurrent duplicate. Apply only to destructive mutations.
 */
export function createIdempotencyMiddleware(
  options: IdempotencyMiddlewareOptions
): MiddlewareHandler {
  const store = createIdempotencyStore(options.redis);

  return async (c, next) => {
    const key = c.req.header(IDEMPOTENCY_HEADER)?.trim();
    if (!key) {
      throw new ValidationError(
        "The Idempotency-Key header is required for this operation.",
        [{ name: IDEMPOTENCY_HEADER, reason: "Header is required" }],
        { code: "IDEMPOTENCY_KEY_REQUIRED" }
      );
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new ValidationError(
        "The Idempotency-Key header is malformed.",
        [
          {
            name: IDEMPOTENCY_HEADER,
            reason: "Use 8 to 128 letters, digits, dot, colon, underscore or hyphen",
          },
        ],
        { code: "IDEMPOTENCY_KEY_REQUIRED" }
      );
    }

    const operator = c.get("operatorId");
    const operatorId = typeof operator === "string" ? operator : "anonymous";
    const scope = idempotencyScope(
      operatorId,
      c.req.method,
      c.req.path,
      key
    );

    let reservation: IdempotencyReservation;
    try {
      reservation = await store.reserve(scope);
    } catch (error) {
      throw new ServiceUnavailableError(
        "The idempotency store is unavailable. Retry the request.",
        { code: "DEPENDENCY_UNAVAILABLE", cause: error }
      );
    }

    if (reservation.status === "pending") {
      throw new ConflictError(
        "An identical request is already in progress.",
        { code: "IDEMPOTENCY_CONFLICT" }
      );
    }
    if (reservation.status === "completed") {
      return new Response(reservation.response.body, {
        status: reservation.response.status,
        headers: {
          ...reservation.response.headers,
          "x-idempotent-replay": "true",
        },
      });
    }

    try {
      await next();
    } catch (error) {
      await store.release(scope);
      throw error;
    }

    if (c.res.status >= 500) {
      await store.release(scope);
      return;
    }

    const body = await c.res.clone().text();
    const contentType = c.res.headers.get("content-type");
    try {
      await store.complete(scope, {
        status: c.res.status,
        body,
        headers: contentType ? { "content-type": contentType } : {},
      });
    } catch (error) {
      console.warn("[idempotency] failed to persist the response", error);
    }
    return;
  };
}
