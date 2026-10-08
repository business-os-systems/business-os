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

export type { Logger } from "pino";
