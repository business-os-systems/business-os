import { Prisma, type PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";

export interface TenantPiiMember {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly membershipStatus: string;
  readonly joinedAt: string;
}

export interface TenantPiiResult {
  readonly tenantId: string;
  readonly members: TenantPiiMember[];
  readonly checkedAt: string;
}

export interface ReadTenantPiiInput {
  readonly organizationId: string;
  readonly operatorId: string;
  readonly reason: string;
  readonly requestId: string;
}

interface TenantPiiRow {
  userId: string;
  name: string;
  email: string;
  membershipStatus: string;
  joinedAt: Date;
}

const RAW_SQL_ERROR_CODE = "P2010";
const SQLSTATE_IN_MESSAGE = /Code: `([A-Z0-9]+)`/;
const PII_REASON_IN_MESSAGE = /PII_REASON_REQUIRED/;

function rawSqlState(error: unknown): string | null {
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
  const match = SQLSTATE_IN_MESSAGE.exec(error.message);
  return match?.[1] ?? null;
}

function rawSqlMessage(error: unknown): string {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return "";
  }
  const meta = error.meta as { message?: unknown } | undefined;
  const fromMeta = typeof meta?.message === "string" ? meta.message : "";
  return `${fromMeta} ${error.message}`;
}

/**
 * The database raises private PT classes (D-028). A genuine 42501 or 22023 is
 * a deploy fault, so it is never mapped to a business error here.
 */
function throwMappedPiiError(error: unknown): never {
  const sqlState = rawSqlState(error);

  if (sqlState === "PT404") {
    throw new NotFoundError("Tenant not found.", {
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    });
  }

  if (sqlState === "PT403") {
    throw new ForbiddenError("Capability denied.", {
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
    });
  }

  if (
    sqlState === "PT422" &&
    PII_REASON_IN_MESSAGE.test(rawSqlMessage(error))
  ) {
    throw new ValidationError(
      "A recorded reason is required to read personal data.",
      undefined,
      { code: PLATFORM_ERROR_CODE.PII_REASON_REQUIRED },
    );
  }

  throw error;
}

/**
 * Reads active member contact data through the audited definer function.
 * The function writes its own audit row before returning any row (D-023),
 * so this service must not cache or persist the result.
 */
export async function readTenantPii(
  prisma: PrismaClient,
  input: ReadTenantPiiInput,
): Promise<TenantPiiResult> {
  let rows: TenantPiiRow[] = [];

  try {
    rows = await prisma.$queryRaw<TenantPiiRow[]>(
      Prisma.sql`SELECT * FROM platform.fn_tenant_pii(${input.organizationId}, ${input.operatorId}, ${input.reason}, ${input.requestId})`,
    );
  } catch (error) {
    throwMappedPiiError(error);
  }

  return {
    tenantId: input.organizationId,
    members: rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      membershipStatus: row.membershipStatus,
      joinedAt: row.joinedAt.toISOString(),
    })),
    checkedAt: new Date().toISOString(),
  };
}
