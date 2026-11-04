import { Prisma } from "@suite/db";
import type { AppError } from "@suite/core/errors";

/**
 * The audited definer functions raise private PT SQLSTATE classes (D-028) with
 * a message naming the business code. Prisma exposes both through P2010, so the
 * mapping is a table of rules rather than a chain of branches. A genuine
 * 42501 or 22023 never matches and is rethrown: it is a deploy fault, not a
 * business outcome.
 */
export interface PlatformSqlErrorRule {
  readonly sqlState: string;
  /** Optional message match, checked before a state-only rule. */
  readonly messagePattern?: RegExp;
  readonly create: () => AppError;
}

const RAW_SQL_ERROR_CODE = "P2010";
const SQLSTATE_IN_MESSAGE = /Code: `([A-Z0-9]+)`/;

export function readPlatformSqlState(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }
  if (error.code !== RAW_SQL_ERROR_CODE) {
    return null;
  }
  const meta = error.meta as { code?: unknown } | undefined;
  if (typeof meta?.code === "string") {
    return meta.code;
  }
  return SQLSTATE_IN_MESSAGE.exec(error.message)?.[1] ?? null;
}

export function readPlatformSqlMessage(error: unknown): string {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return "";
  }
  const meta = error.meta as { message?: unknown } | undefined;
  const fromMeta = typeof meta?.message === "string" ? meta.message : "";
  return `${fromMeta} ${error.message}`;
}

export function throwMappedPlatformSqlError(
  error: unknown,
  rules: readonly PlatformSqlErrorRule[]
): never {
  const sqlState = readPlatformSqlState(error);
  if (sqlState !== null) {
    const message = readPlatformSqlMessage(error);
    for (const rule of rules) {
      const stateMatches = rule.sqlState === sqlState;
      const messageMatches =
        rule.messagePattern === undefined || rule.messagePattern.test(message);
      if (stateMatches && messageMatches) {
        throw rule.create();
      }
    }
  }

  throw error;
}
