import pino, { type DestinationStream, type Logger, type LoggerOptions as PinoLoggerOptions } from "pino";
import { getTraceContext } from "./correlation.js";
import { DEFAULT_REDACT_PATHS, REDACT_CENSOR } from "./redact.js";

export interface RequestLogContext {
  traceId: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  route?: string;
  [key: string]: unknown;
}

export interface CreateLoggerOptions {
  level?: string;
  pretty?: boolean;
  serviceName?: string;
  redactPaths?: string[];
  destination?: DestinationStream;
}

/**
 * Creates an enterprise-grade Pino v9 logger instance configured with
 * ISO timestamps, sensitive data redaction, and environment-aware formatting.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const env = process.env.NODE_ENV ?? "development";
  const isProduction = env === "production" || env === "staging";
  const isDevelopment = env === "development";
  const isTest = env === "test" || Boolean(process.env.VITEST);

  // By default, enable pretty formatting only in development if not in test and not explicitly disabled
  const shouldPrettyPrint = options.pretty ?? (isDevelopment && !isTest);

  const redactPaths = Array.from(
    new Set([...DEFAULT_REDACT_PATHS, ...(options.redactPaths ?? [])])
  );

  const baseConfig: PinoLoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
    base: {
      env,
      service: options.serviceName ?? process.env.SERVICE_NAME ?? "business-os",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    redact: {
      paths: redactPaths,
      censor: REDACT_CENSOR,
    },
  };

  // If a destination stream is provided (e.g. MemoryStream / SonicBoom / custom stream), use it directly
  if (options.destination) {
    return pino(baseConfig, options.destination);
  }

  // Pretty printing via pino-pretty transport in development
  if (shouldPrettyPrint) {
    return pino({
      ...baseConfig,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  }

  // Production and testing: structured JSON directly to process.stdout
  return pino(baseConfig);
}

/**
 * Root default application logger singleton.
 */
export const logger: Logger = createLogger();

/**
 * Creates a child logger bound to specific request and trace metadata.
 */
export function createRequestLogger(
  context: RequestLogContext,
  baseLogger: Logger = logger
): Logger {
  return baseLogger.child(context);
}

/**
 * Returns a logger enriched with the current AsyncLocalStorage trace context,
 * or falls back to the base logger if no ambient context is active.
 */
export function getContextLogger(baseLogger: Logger = logger): Logger {
  const context = getTraceContext();
  if (!context) {
    return baseLogger;
  }
  return baseLogger.child(context);
}
