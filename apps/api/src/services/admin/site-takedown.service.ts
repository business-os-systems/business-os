import { Prisma, withTenantContext, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
} from "@suite/core";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type AppError,
} from "@suite/core/errors";
import {
  CMS_SITE_STATUSES,
  SITE_LIST_LIMIT,
  SITE_TAKEDOWN_ACTIONS,
  type CmsSiteStatus,
  type SiteTakedownAction,
  type SiteTakedownResult,
  type TenantSite,
} from "./site-takedown.contract.js";
import { throwMappedPlatformSqlError } from "./platform-sql-errors.js";
import { assertFreshStepUp } from "./step-up-guard.service.js";
import { readTenantOverview } from "./tenant-view.service.js";

const SITE_NOT_FOUND = "The requested site was not found in this tenant.";

const REASON_REQUIRED_MESSAGE =
  "A reason of " +
  TENANT_LIFECYCLE_REASON_MIN_LENGTH +
  " to " +
  TENANT_LIFECYCLE_REASON_MAX_LENGTH +
  " characters is required.";

interface SiteStatusRow {
  readonly siteId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly occurredAt: Date;
  readonly hostnames: string[];
}

const SITE_TAKEDOWN_ERROR_RULES = [
  {
    sqlState: "PT404",
    create: () =>
      new NotFoundError(SITE_NOT_FOUND, { code: "NOT_FOUND" }),
  },
  {
    sqlState: "PT409",
    create: () =>
      new ConflictError(
        "The site's status changed since it was observed. Reload the record and retry.",
        { code: PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT }
      ),
  },
  {
    sqlState: "PT403",
    create: () =>
      new ForbiddenError("Capability denied.", {
        code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      }),
  },
  {
    sqlState: "PT422",
    messagePattern: /INVALID_TRANSITION/,
    create: () =>
      new ValidationError("That site transition is not allowed from its current state.", undefined, {
        code: PLATFORM_ERROR_CODE.INVALID_TRANSITION,
      }),
  },
  {
    sqlState: "PT422",
    create: () =>
      new ValidationError(REASON_REQUIRED_MESSAGE, undefined, {
        code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      }),
  },
] as const satisfies readonly {
  readonly sqlState: string;
  readonly messagePattern?: RegExp;
  readonly create: () => AppError;
}[];

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (
    trimmed.length < TENANT_LIFECYCLE_REASON_MIN_LENGTH ||
    trimmed.length > TENANT_LIFECYCLE_REASON_MAX_LENGTH
  ) {
    throw new ValidationError(REASON_REQUIRED_MESSAGE, undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }
  return trimmed;
}

/** Reads a CMS site status from a database row, refusing an unknown value. */
export function readStatus(value: string): CmsSiteStatus {
  const status = CMS_SITE_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) {
    throw new ValidationError("The site returned an unknown status.", undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }
  return status;
}

function mapResult(row: SiteStatusRow): SiteTakedownResult {
  return {
    siteId: row.siteId,
    fromStatus: readStatus(row.fromStatus),
    toStatus: readStatus(row.toStatus),
    occurredAt: row.occurredAt.toISOString(),
    hostnames: row.hostnames,
  };
}

async function assertTenantExists(
  prisma: PrismaClient,
  organizationId: string
): Promise<void> {
  const tenant = await readTenantOverview(prisma, organizationId);
  if (tenant === null) {
    throw new NotFoundError("Tenant not found.", {
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    });
  }
}

/** Lists a tenant's sites and hostnames for the operator danger page. */
export async function listTenantSites(
  prisma: PrismaClient,
  organizationId: string
): Promise<readonly TenantSite[]> {
  await assertTenantExists(prisma, organizationId);
  const rows = await withTenantContext(organizationId, (tx) =>
    tx.cmsSite.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SITE_LIST_LIMIT,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        updatedAt: true,
        domains: {
          where: { status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
          orderBy: [{ isPrimary: "desc" }, { hostname: "asc" }],
          select: { hostname: true },
        },
      },
    })
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: readStatus(row.status),
    hostnames: row.domains.map((domain) => domain.hostname),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

interface SiteChangeInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly expectedStatus: CmsSiteStatus;
  readonly reason: string;
  readonly operatorId: string;
  readonly requestId: string;
  readonly stepUpToken: string | null;
}

async function callStatusFunction(
  prisma: PrismaClient,
  input: SiteChangeInput,
  action: SiteTakedownAction
): Promise<SiteTakedownResult> {
  const reason = requireReason(input.reason);
  await assertFreshStepUp({
    operatorId: input.operatorId,
    token: input.stepUpToken,
  });
  try {
    const rows = await prisma.$transaction(async (tx) => {
      if (action === SITE_TAKEDOWN_ACTIONS.SUSPEND) {
        return tx.$queryRaw<SiteStatusRow[]>(Prisma.sql`
          SELECT * FROM platform.fn_suspend_cms_site(
            ${input.organizationId},
            ${input.siteId},
            ${input.expectedStatus},
            ${reason},
            ${input.operatorId},
            ${input.requestId}
          )
        `);
      }
      return tx.$queryRaw<SiteStatusRow[]>(Prisma.sql`
        SELECT * FROM platform.fn_restore_cms_site(
          ${input.organizationId},
          ${input.siteId},
          ${input.expectedStatus},
          ${reason},
          ${input.operatorId},
          ${input.requestId}
        )
      `);
    });
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError(SITE_NOT_FOUND, { code: "NOT_FOUND" });
    }
    return mapResult(row);
  } catch (error) {
    throwMappedPlatformSqlError(error, SITE_TAKEDOWN_ERROR_RULES);
  }
}

/** Suspends a published site immediately; the audit rows commit with it. */
export async function suspendSite(
  prisma: PrismaClient,
  input: SiteChangeInput
): Promise<SiteTakedownResult> {
  return callStatusFunction(prisma, input, SITE_TAKEDOWN_ACTIONS.SUSPEND);
}

/** Restores a suspended site to the status recorded by its suspension. */
export async function restoreSite(
  prisma: PrismaClient,
  input: SiteChangeInput
): Promise<SiteTakedownResult> {
  return callStatusFunction(prisma, input, SITE_TAKEDOWN_ACTIONS.RESTORE);
}
