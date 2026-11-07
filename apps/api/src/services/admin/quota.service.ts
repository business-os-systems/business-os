import { Prisma, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  QUOTA_RESOURCE_DEFINITIONS,
  isQuotaKey,
} from "@suite/core";
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import {
  throwMappedPlatformSqlError,
  type PlatformSqlErrorRule,
} from "./platform-sql-errors.js";
import type { QuotaItem, QuotaList, UpdateQuotaItem } from "./quota.contract.js";
import { assertTenantExists } from "./tenant-view.service.js";

export interface SetQuotasInput {
  readonly organizationId: string;
  readonly items: readonly UpdateQuotaItem[];
  readonly operatorId: string;
  readonly requestId: string;
}

interface QuotaUsageRow {
  readonly resourceKey: string;
  readonly limitValue: string;
  readonly unit: string | null;
  readonly currentValue: string | null;
  readonly isMeasurable: boolean;
  readonly asOf: Date;
  readonly isEnforced: boolean;
  readonly isOverLimit: boolean;
  readonly version: string;
}

interface PreparedQuotaItem extends UpdateQuotaItem {
  readonly limit: bigint;
}

const QUOTA_SQL_RULES: readonly PlatformSqlErrorRule[] = [
  {
    sqlState: "PT409",
    create: () =>
      new ConflictError(
        "The quota changed since it was observed. Reload the tenant and retry.",
        { code: PLATFORM_ERROR_CODE.QUOTA_CONFLICT }
      ),
  },
  {
    sqlState: "PT422",
    create: () =>
      new ValidationError(
        "The quota request failed validation.",
        undefined,
        { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
      ),
  },
  // Defence in depth: the route guard and assertTenantExists normally answer
  // first, but the definer function re-checks both.
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

function toQuotaUnit(value: string | null): "count" | "bytes" | null {
  if (value === null || value === "count" || value === "bytes") {
    return value;
  }
  throw new InternalServerError(
    "The usage view returned an unknown quota unit."
  );
}

function toQuotaItem(row: QuotaUsageRow): QuotaItem {
  return {
    resourceKey: row.resourceKey,
    limitValue: row.limitValue,
    unit: toQuotaUnit(row.unit),
    currentValue: row.currentValue,
    isMeasurable: row.isMeasurable,
    asOf: row.asOf.toISOString(),
    isEnforced: row.isEnforced,
    isOverLimit: row.isOverLimit,
    version: row.version,
  };
}

export async function readTenantQuotas(
  prisma: Prisma.TransactionClient,
  organizationId: string
): Promise<QuotaList> {
  const rows = await prisma.$queryRaw<QuotaUsageRow[]>(Prisma.sql`
    SELECT
      "resourceKey",
      "limitValue"::text AS "limitValue",
      "unit",
      "currentValue"::text AS "currentValue",
      "isMeasurable",
      "asOf",
      "isEnforced",
      "isOverLimit",
      to_char(
        "limitUpdatedAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "version"
    FROM platform."v_tenant_usage"
    WHERE "organizationId" = ${organizationId}
    ORDER BY "resourceKey" ASC
  `);
  return { items: rows.map(toQuotaItem) };
}

export async function getTenantQuotas(
  prisma: PrismaClient,
  organizationId: string
): Promise<QuotaList> {
  await assertTenantExists(prisma, organizationId);
  return readTenantQuotas(prisma, organizationId);
}

// The Zod contract has already bounded the value to a signed 64-bit integer.
function prepareQuotaItems(
  items: readonly UpdateQuotaItem[]
): PreparedQuotaItem[] {
  return items.map((item) => ({
    ...item,
    limit: BigInt(item.limitValue),
  }));
}

function requireRegisteredQuotaKeys(
  items: readonly UpdateQuotaItem[]
): void {
  const invalid = items.flatMap((item, index) =>
    isQuotaKey(item.resourceKey)
      ? []
      : [
          {
            name: `items.${index}.resourceKey`,
            reason: `Unknown quota resource key: ${item.resourceKey}`,
          },
        ]
  );
  if (invalid.length > 0) {
    throw new ValidationError("Unknown quota resource key.", invalid, {
      code: PLATFORM_ERROR_CODE.UNKNOWN_RESOURCE_KEY,
    });
  }
}

/**
 * FR-091: enforcement requires a measurable source. The SQL function keeps its
 * storage-specific guard as defence in depth; this rule is driven by the same
 * registry the usage view uses, so a future unmeasurable key is covered here.
 */
function requireEnforceableQuotaItems(
  items: readonly UpdateQuotaItem[]
): void {
  const invalid = items.flatMap((item, index) => {
    if (!isQuotaKey(item.resourceKey) || !item.isEnforced) {
      return [];
    }
    const definition = QUOTA_RESOURCE_DEFINITIONS[item.resourceKey];
    return definition.measurable
      ? []
      : [
          {
            name: `items.${index}.isEnforced`,
            reason: `${definition.label} cannot be enforced because consumption is not measured.`,
          },
        ];
  });
  if (invalid.length > 0) {
    throw new ValidationError(
      "A quota cannot be enforced when its consumption is not measured.",
      invalid,
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
}

async function applyQuotaChanges(
  tx: Prisma.TransactionClient,
  input: SetQuotasInput,
  items: readonly PreparedQuotaItem[]
): Promise<QuotaList> {
  for (const item of items) {
    await tx.$queryRaw(Prisma.sql`
      SELECT * FROM platform.fn_set_quota_versioned(
        ${input.organizationId},
        ${item.resourceKey},
        ${item.limit},
        ${item.isEnforced},
        ${item.expectedVersion},
        ${input.operatorId},
        ${input.requestId}
      )
    `);
  }
  return readTenantQuotas(tx, input.organizationId);
}

/**
 * Applies one or more quota changes in a single transaction. Each item carries
 * the version it observed; a stale item aborts the whole batch (FR-114). The
 * database function writes the audit row for each changed quota.
 */
export async function setTenantQuotas(
  prisma: PrismaClient,
  input: SetQuotasInput
): Promise<QuotaList> {
  requireRegisteredQuotaKeys(input.items);
  requireEnforceableQuotaItems(input.items);
  const preparedItems = prepareQuotaItems(input.items);
  await assertTenantExists(prisma, input.organizationId);

  try {
    return await prisma.$transaction((tx) =>
      applyQuotaChanges(tx, input, preparedItems)
    );
  } catch (error) {
    throwMappedPlatformSqlError(error, QUOTA_SQL_RULES);
  }
}
