import type { PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";
import {
  PLATFORM_AUDIT_ACTIONS,
  appendPlatformAuditEvent,
} from "@suite/auth/platform";
import { decodeIdCursor, pageSlice } from "../../lib/id-cursor.js";
import {
  MAX_OPERATOR_SESSION_PAGE_SIZE,
  type OperatorActor,
  type OperatorSessionPage,
  type OperatorSessionSummary,
} from "./operator.contract.js";

const OPERATOR_SESSION_ENTITY_TYPE = "PlatformOperatorSession";

const OPERATOR_SESSION_SELECT = {
  id: true,
  issuedAt: true,
  expiresAt: true,
  idleExpiresAt: true,
  revokedAt: true,
  ip: true,
  userAgent: true,
} as const;

function toSummary(row: {
  readonly id: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly idleExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}): OperatorSessionSummary {
  return {
    id: row.id,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    idleExpiresAt: row.idleExpiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    ip: row.ip,
    userAgent: row.userAgent,
  };
}

async function listOperatorSessions(
  prisma: PrismaClient,
  input: {
    readonly operatorId: string;
    readonly cursor?: string;
    readonly limit: number;
  }
): Promise<OperatorSessionPage> {
  const limit = Math.min(
    Math.max(input.limit, 1),
    MAX_OPERATOR_SESSION_PAGE_SIZE
  );
  const operator = await prisma.platformOperator.findUnique({
    where: { id: input.operatorId },
    select: { id: true },
  });
  if (operator === null) {
    throw new NotFoundError("Operator not found.", {
      code: PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND,
    });
  }
  const cursor =
    input.cursor === undefined ? undefined : decodeIdCursor(input.cursor);
  const rows = await prisma.operatorSession.findMany({
    where: { operatorId: input.operatorId },
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    select: OPERATOR_SESSION_SELECT,
  });
  const page = pageSlice(rows, limit, (row) => row.id);
  return {
    items: page.items.map(toSummary),
    nextCursor: page.nextCursor,
  };
}

async function revokeOperatorSession(
  prisma: PrismaClient,
  input: {
    readonly operatorId: string;
    readonly sessionId: string;
    readonly actor: OperatorActor;
  }
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await tx.operatorSession.findFirst({
      where: { id: input.sessionId, operatorId: input.operatorId },
      select: { id: true, revokedAt: true },
    });
    if (session === null) {
      throw new NotFoundError("Operator session not found.", {
        code: PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND,
      });
    }
    if (session.revokedAt !== null) {
      return;
    }
    await tx.operatorSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.actor.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.SESSION_REVOKED,
      entityType: OPERATOR_SESSION_ENTITY_TYPE,
      entityId: session.id,
      before: { revokedAt: null },
      after: { revokedAt: now.toISOString() },
      requestId: input.actor.requestId,
    });
  });
}

export function createOperatorSessionService(prisma: PrismaClient) {
  return {
    list: (input: {
      readonly operatorId: string;
      readonly cursor?: string;
      readonly limit: number;
    }) => listOperatorSessions(prisma, input),
    revoke: (input: {
      readonly operatorId: string;
      readonly sessionId: string;
      readonly actor: OperatorActor;
    }) => revokeOperatorSession(prisma, input),
  };
}
