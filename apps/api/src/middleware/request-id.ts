import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

/**
 * Assigns or propagates distributed trace correlation ID (UUIDv4/UUIDv7) on every request.
 * Sets the response header `x-request-id` and context variable `requestId`.
 */
export function requestIdMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const incomingId =
      c.req.header("x-request-id") ||
      c.req.header("x-trace-id") ||
      c.req.header("x-correlation-id");

    const requestId = incomingId?.trim() || `req_${randomUUID()}`;

    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    c.header("x-correlation-id", requestId);

    await next();
  };
}
