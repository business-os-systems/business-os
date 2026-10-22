export {
  createLogger,
  logger,
  createRequestLogger,
  getContextLogger,
  type RequestLogContext,
  type CreateLoggerOptions,
} from "./logger.js";

export {
  CORRELATION_HEADER,
  REQUEST_ID_HEADER,
  TRACEPARENT_HEADER,
  type TraceContext,
  generateTraceId,
  extractTraceId,
  runWithTraceContext,
  getTraceContext,
  getCurrentTraceId,
} from "./correlation.js";

export {
  DEFAULT_REDACT_PATHS,
  REDACT_CENSOR,
} from "./redact.js";

export {
  type ErrorReportingContext,
  type IErrorReporter,
} from "./error-reporter.js";

export {
  sanitizePii,
  isSensitiveKey,
  scrubStringValues,
  REDACTED_MARKER,
} from "./sanitize.js";

export {
  isProduction,
  isDevelopment,
  isTest,
} from "./env.js";

export type { Logger } from "pino";
