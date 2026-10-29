/**
 * Hexagonal Port: Error Reporting & Telemetry
 * Location: packages/logger/src/error-reporter.ts
 */

export interface ErrorReportingContext {
  organizationId?: string;
  branchId?: string;
  userId?: string;
  routePath?: string;
  componentName?: string;
  correlationId?: string;
  severity?: "fatal" | "error" | "warning" | "info";
  metadata?: Record<string, unknown>;
}

export interface IErrorReporter {
  /**
   * Captures an unhandled exception or error instance with optional session context.
   * Dispatches asynchronously; fail-open with zero disruption to user execution.
   */
  captureException(error: Error | unknown, context?: ErrorReportingContext): void;

  /**
   * Captures a diagnostic message with severity and context.
   */
  captureMessage(message: string, context?: ErrorReportingContext): void;

  /**
   * Flushes buffered telemetry events within an explicit timeout window (ms).
   */
  flush(timeoutMs?: number): Promise<boolean>;
}
