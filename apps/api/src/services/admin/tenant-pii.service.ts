import { Prisma, type PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import { throwMappedPlatformSqlError } from "./platform-sql-errors.js";

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

const PII_REASON_IN_MESSAGE = /PII_REASON_REQUIRED/;

/**
 * The database raises private PT classes (D-028). A genuine 42501 or 22023 is
 * a deploy fault, so it is never mapped to a business error here.
 */
const PII_ERROR_RULES = [
  {
    sqlState: "PT422",
    messagePattern: PII_REASON_IN_MESSAGE,
    create: () =>
      new ValidationError(
        "A recorded reason is required to read personal data.",
        undefined,
        { code: PLATFORM_ERROR_CODE.PII_REASON_REQUIRED }
      ),
  },
  {
    sqlState: "PT404",
    create: () =>
      new NotFoundError("Tenant not found.", {
        code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
      }),
  },
  {
    sqlState: "PT403",
    create: () =>
      new ForbiddenError("Capability denied.", {
        code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      }),
  },
];

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
    throwMappedPlatformSqlError(error, PII_ERROR_RULES);
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
