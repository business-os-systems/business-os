import { Prisma, type PlatformOperatorStatus } from "@suite/db";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import { ConflictError } from "@suite/core/errors";
import { OPERATOR_STATUS } from "./operator.contract.js";

const GOVERNANCE_LOCK_KEY = "platform:operator-governance";

/** The minimum row shape the last-operator guard needs. */
export interface LastOperatorCandidate {
  readonly id: string;
  readonly status: PlatformOperatorStatus;
  readonly capabilities: readonly {
    readonly capability: string;
    readonly revokedAt: Date | null;
  }[];
}

function lastOperatorGuard(): ConflictError {
  return new ConflictError(
    "The last operator able to manage operators cannot be demoted.",
    { code: PLATFORM_ERROR_CODE.LAST_OPERATOR_GUARD }
  );
}

function isLastOperatorManager(input: {
  readonly targetIsActive: boolean;
  readonly targetHasCapability: boolean;
  readonly otherActiveManagerCount: number;
}): boolean {
  return (
    input.targetIsActive &&
    input.targetHasCapability &&
    input.otherActiveManagerCount === 0
  );
}

export async function lockOperatorGovernance(
  tx: Prisma.TransactionClient
): Promise<void> {
  // Serializes the last-operator check across API instances so two concurrent
  // demotions cannot each observe the other as the surviving manager.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${GOVERNANCE_LOCK_KEY}))::text AS locked`;
}

export async function assertAnotherOperatorManager(
  tx: Prisma.TransactionClient,
  target: LastOperatorCandidate
): Promise<void> {
  const targetHasCapability = target.capabilities.some(
    (row) =>
      row.revokedAt === null &&
      row.capability === PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code
  );
  const otherActiveManagerCount = await tx.operatorCapability.count({
    where: {
      capability: PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
      revokedAt: null,
      operatorId: { not: target.id },
      operator: { status: OPERATOR_STATUS.ACTIVE },
    },
  });
  if (
    isLastOperatorManager({
      targetIsActive: target.status === OPERATOR_STATUS.ACTIVE,
      targetHasCapability,
      otherActiveManagerCount,
    })
  ) {
    throw lastOperatorGuard();
  }
}
