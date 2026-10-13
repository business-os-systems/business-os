import type { MiddlewareHandler } from "hono";
import { logger, runWithTraceContext } from "@suite/logger";
import { httpRequestCounter, httpRequestDurationHistogram } from "../telemetry.js";

/**
 * Access logger middleware capturing structured request execution telemetry.
 * Automatically propagates ambient trace context to @suite/logger and records Prometheus metrics.
 */
export function accessLoggerMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.get("requestId");
    const startTime = performance.now();
    const method = c.req.method;
    const path = c.req.path;

    await runWithTraceContext({ traceId: requestId }, async () => {
      await next();
    });

    const durationSeconds = (performance.now() - startTime) / 1000;
    const durationMs = Math.round(durationSeconds * 100000) / 100;
    const status = c.res.status;

    // Track Prometheus metrics (exclude Prometheus /metrics endpoint itself to prevent loop)
    if (path !== "/metrics") {
      httpRequestCounter.inc({ method, path, status: String(status) });
      httpRequestDurationHistogram.observe(
        { method, path, status: String(status) },
        durationSeconds
      );
    }

    const forwardedHeader = c.req.header("x-forwarded-for");
    const forwardedIp = forwardedHeader ? forwardedHeader.split(",")[0]?.trim() : undefined;
    const clientIp = c.req.header("cf-connecting-ip") ?? forwardedIp ?? c.req.header("x-real-ip");

    const logPayload = {
      method,
      path,
      status,
      durationMs,
      clientIp,
      userAgent: c.req.header("user-agent"),
      requestId,
    };

    if (status >= 500) {
      logger.error(logPayload, `HTTP ${method} ${path} failed with ${status}`);
    } else if (status >= 400) {
      logger.warn(logPayload, `HTTP ${method} ${path} returned ${status}`);
    } else {
      logger.info(logPayload, `HTTP ${method} ${path} completed with ${status}`);
    }
  };
}
