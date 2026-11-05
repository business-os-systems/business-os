import { Prisma, type PrismaClient } from "@suite/db";
import { PLATFORM_ERROR_CODE, isAppId } from "@suite/core";
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import {
  branchOverrideSchema,
  type TenantEntitlement,
  type TenantEntitlementList,
} from "./entitlement.contract.js";
import {
  throwMappedPlatformSqlError,
  type PlatformSqlErrorRule,
} from "./platform-sql-errors.js";
import { assertTenantExists } from "./tenant-view.service.js";

export interface SetEntitlementInput {
  readonly organizationId: string;
  readonly appId: string;
  readonly enabled: boolean;
  readonly expectedVersion: string;
  readonly operatorId: string;
  readonly requestId: string;
}

interface EntitlementRow {
  readonly appId: string;
  readonly isEnabled: boolean;
  readonly installedAt: Date;
  readonly version: string;
  readonly branchOverrides: unknown;
}

const branchOverridesSchema = branchOverrideSchema.array();

const ENTITLEMENT_SQL_RULES: readonly PlatformSqlErrorRule[] = [
  {
    sqlState: "PT409",
    create: () =>
      new ConflictError(
        "The entitlement changed since it was observed. Reload the tenant and retry.",
        { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
      ),
  },
  {
    sqlState: "PT422",
    messagePattern: /UNKNOWN_APP/,
    create: () =>
      new ValidationError(
        "The application is not installed for this tenant.",
        undefined,
        { code: PLATFORM_ERROR_CODE.UNKNOWN_APP }
      ),
  },
  {
    sqlState: "PT422",
    messagePattern: /VALIDATION_FAILED/,
    create: () =>
      new ValidationError(
        "The entitlement request failed validation.",
        undefined,
        { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
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

function toEntitlement(row: EntitlementRow): TenantEntitlement {
  const overrides = branchOverridesSchema.safeParse(row.branchOverrides);
  if (!overrides.success) {
    throw new InternalServerError(
      "The entitlement view returned malformed branch overrides."
    );
  }
  return {
    appId: row.appId,
    isEnabled: row.isEnabled,
    installedAt: row.installedAt.toISOString(),
    version: row.version,
    branchOverrides: overrides.data,
  };
}

async function listTenantEntitlements(
  prisma: Prisma.TransactionClient,
  organizationId: string
): Promise<TenantEntitlement[]> {
  const rows = await prisma.$queryRaw<EntitlementRow[]>(Prisma.sql`
    SELECT "appId", "isEnabled", "installedAt", "version", "branchOverrides"
    FROM platform."v_tenant_app_entitlements"
    WHERE "organizationId" = ${organizationId}
    ORDER BY "appId" ASC
  `);
  return rows.map(toEntitlement);
}

export async function getTenantEntitlements(
  prisma: PrismaClient,
  organizationId: string
): Promise<TenantEntitlementList> {
  await assertTenantExists(prisma, organizationId);
  return { apps: await listTenantEntitlements(prisma, organizationId) };
}

async function applyEntitlementChange(
  tx: Prisma.TransactionClient,
  input: SetEntitlementInput
): Promise<TenantEntitlementList> {
  await tx.$queryRaw(Prisma.sql`
    SELECT * FROM platform.fn_set_entitlement_versioned(
      ${input.organizationId},
      ${input.appId},
      ${input.enabled},
      ${input.expectedVersion},
      ${input.operatorId},
      ${input.requestId}
    )
  `);
  return { apps: await listTenantEntitlements(tx, input.organizationId) };
}

/**
 * Toggles one installed application. The database function locks the row,
 * compares the observed version and writes the audit row in the same
 * transaction (FR-029, FR-114, CT-4).
 */
export async function updateTenantEntitlement(
  prisma: PrismaClient,
  input: SetEntitlementInput
): Promise<TenantEntitlementList> {
  if (!isAppId(input.appId)) {
    throw new ValidationError(
      "The application is not registered in the platform catalog.",
      undefined,
      { code: PLATFORM_ERROR_CODE.UNKNOWN_APP }
    );
  }

  await assertTenantExists(prisma, input.organizationId);

  try {
    return await prisma.$transaction((tx) =>
      applyEntitlementChange(tx, input)
    );
  } catch (error) {
    throwMappedPlatformSqlError(error, ENTITLEMENT_SQL_RULES);
  }
}
