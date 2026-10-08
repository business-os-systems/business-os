import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export const CORRELATION_HEADER = "x-correlation-id";
export const REQUEST_ID_HEADER = "x-request-id";
export const TRACEPARENT_HEADER = "traceparent";

export interface TraceContext {
  traceId: string;
  correlationId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  route?: string;
  [key: string]: unknown;
}

export const traceContextStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Generates a standard RFC 4122 v4 trace/correlation identifier.
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Extracts a trace or correlation ID from incoming request headers,
 * or generates a new trace ID if none are present.
 */
export function extractTraceId(
  headers?: Record<string, string | string[] | undefined> | Headers
): string {
  if (!headers) {
    return generateTraceId();
  }

  if (typeof (headers as Headers).get === "function") {
    const webHeaders = headers as Headers;
    const correlationId =
      webHeaders.get(CORRELATION_HEADER) ||
      webHeaders.get(REQUEST_ID_HEADER) ||
      webHeaders.get(TRACEPARENT_HEADER);
    if (correlationId && correlationId.trim().length > 0) {
      return correlationId.trim();
    }
    return generateTraceId();
  }

  const recordHeaders = headers as Record<string, string | string[] | undefined>;
  const rawId =
    recordHeaders[CORRELATION_HEADER] ||
    recordHeaders[CORRELATION_HEADER.toUpperCase()] ||
    recordHeaders[REQUEST_ID_HEADER] ||
    recordHeaders[REQUEST_ID_HEADER.toUpperCase()] ||
    recordHeaders[TRACEPARENT_HEADER] ||
    recordHeaders[TRACEPARENT_HEADER.toUpperCase()];

  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return rawId.trim();
  }

  if (Array.isArray(rawId) && rawId.length > 0 && typeof rawId[0] === "string" && rawId[0].trim().length > 0) {
    return rawId[0].trim();
  }

  return generateTraceId();
}

/**
 * Runs a synchronous or asynchronous function within an ambient TraceContext.
 */
export function runWithTraceContext<T>(context: TraceContext, fn: () => T): T {
  return traceContextStorage.run(context, fn);
}

/**
 * Retrieves the current ambient TraceContext, if one is active.
 */
export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

/**
 * Retrieves the active traceId from the ambient TraceContext, if present.
 */
export function getCurrentTraceId(): string | undefined {
  return traceContextStorage.getStore()?.traceId;
}
