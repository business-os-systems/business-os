import type { MiddlewareHandler } from "hono";
import { PLATFORM_ERROR_CODE, SUPPORT_SESSION_HEADER } from "@suite/core";
import { ForbiddenError, UnauthorizedError } from "@suite/core/errors";
import { getControlSessionSecret } from "../lib/platform-env.js";
import { getPlatformPrismaClient } from "../lib/platform-db.js";
import {
  verifyImpersonationTicket,
  type ImpersonationTicketPayload,
} from "../services/admin/impersonation-ticket.js";

/**
 * The header name is canonical in @suite/core so the CORS allow-list and this
 * guard cannot drift apart. It carries the signed support-session ticket
 * returned by POST /api/v1/admin/impersonation; the dashboard forwards it on
 * tenant requests, and the ticket is verified here, never accepted as a session.
 */
export { SUPPORT_SESSION_HEADER };

const READ_ONLY_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

export interface SupportSessionContext {
  readonly ticketId: string;
  readonly operatorId: string;
  readonly organizationId: string;
  readonly expiresAt: string;
}

export interface ImpersonationReadonlyGuardOptions {
  readonly headerName: string;
}

function readTicket(
  c: Parameters<MiddlewareHandler>[0],
  headerName: string
): string | null {
  const value = c.req.header(headerName);
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function sessionEnded(): UnauthorizedError {
  return new UnauthorizedError(
    "The support session is invalid, expired or has ended. Start a new session.",
    { code: PLATFORM_ERROR_CODE.SUPPORT_SESSION_ENDED }
  );
}

function readOnlyRefusal(): ForbiddenError {
  return new ForbiddenError(
    "Support sessions are read-only. Create, update, delete and configuration changes are disabled.",
    { code: PLATFORM_ERROR_CODE.SUPPORT_SESSION_READ_ONLY }
  );
}

async function verifyActiveTicket(
  ticket: string,
  now: Date
): Promise<ImpersonationTicketPayload> {
  const payload = verifyImpersonationTicket(
    getControlSessionSecret(),
    ticket,
    now.getTime()
  );
  if (payload === null) {
    throw sessionEnded();
  }

  const row = await getPlatformPrismaClient().impersonationSession.findUnique({
    where: { ticketId: payload.ticketId },
    select: {
      operatorId: true,
      organizationId: true,
      expiresAt: true,
      endedAt: true,
    },
  });

  if (row === null) {
    throw sessionEnded();
  }
  if (
    row.endedAt !== null ||
    row.expiresAt.getTime() <= now.getTime() ||
    row.operatorId !== payload.operatorId ||
    row.organizationId !== payload.organizationId
  ) {
    throw sessionEnded();
  }
  return payload;
}

/**
 * Read-only guard for every tenant route (SC-017, FR-050). An absent header is
 * a no-op; a present ticket must be authentic, unexpired and not ended, and the
 * request may only read. It sets "supportSession" so a handler can audit or
 * scope by the verified session identity.
 */
export function createImpersonationReadonlyGuard(
  options: ImpersonationReadonlyGuardOptions
): MiddlewareHandler {
  return async (c, next) => {
    const ticket = readTicket(c, options.headerName);
    if (ticket === null) {
      await next();
      return;
    }

    const now = new Date();
    const payload = await verifyActiveTicket(ticket, now);

    if (!READ_ONLY_METHODS.has(c.req.method)) {
      throw readOnlyRefusal();
    }

    const supportSession: SupportSessionContext = {
      ticketId: payload.ticketId,
      operatorId: payload.operatorId,
      organizationId: payload.organizationId,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
    c.set("supportSession", supportSession);
    await next();
  };
}
