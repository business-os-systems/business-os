import { Prisma, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  validateCatalogCode,
  type CatalogKey,
} from "@suite/core";
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import { appendPlatformAuditEvent, PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import type { CatalogValue as CatalogValueRow } from "@suite/db";
import { logger } from "@suite/logger";
import { catalogCacheKey, type CatalogCache } from "@suite/redis";
import { assertCatalogKey } from "../catalog-key.js";
import { isUniqueConstraintViolation } from "./prisma-errors.js";
import { assertFreshStepUp } from "./step-up-guard.service.js";
import {
  catalogMetadataSchema,
  type CatalogList,
  type CatalogValue,
  type CreateCatalogValueBody,
  type UpdateCatalogValueBody,
} from "./catalog-admin.contract.js";

export interface CreateCatalogValueInput {
  readonly category: string;
  readonly body: CreateCatalogValueBody;
  readonly operatorId: string;
  readonly requestId: string;
}

export interface UpdateCatalogValueInput {
  readonly category: string;
  readonly code: string;
  readonly body: UpdateCatalogValueBody;
  readonly operatorId: string;
  readonly requestId: string;
  /** Consumed only when the request retires the value (isActive=false). */
  readonly stepUpToken: string | null;
}

interface CatalogValueSnapshot {
  readonly label: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly metadata: Prisma.InputJsonValue;
}

function toCatalogValue(row: CatalogValueRow): CatalogValue {
  return {
    catalogKey: row.catalogKey,
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: catalogMetadataSchema.parse(row.metadata),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSnapshot(row: CatalogValueRow): CatalogValueSnapshot {
  return {
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: catalogMetadataSchema.parse(row.metadata),
  };
}

function normalizeCode(key: CatalogKey, code: string): string {
  const result = validateCatalogCode(key, code);
  if (!result.valid) {
    throw new ValidationError(
      `The ${key} code "${code}" is invalid.`,
      [{ name: "code", reason: result.reason }],
      { code: PLATFORM_ERROR_CODE.INVALID_CODE_FORMAT },
    );
  }
  return result.normalized;
}

function isDuplicateCodeError(error: unknown): boolean {
  return isUniqueConstraintViolation(error);
}

async function assertCatalogExists(tx: Prisma.TransactionClient, key: CatalogKey): Promise<void> {
  const catalog = await tx.catalog.findUnique({ where: { key } });
  if (catalog === null) {
    throw new NotFoundError(`Unknown reference catalog: ${key}.`, {
      code: PLATFORM_ERROR_CODE.UNKNOWN_CATALOG,
    });
  }
}

/**
 * Invalidation runs after the transaction commits because Redis is not part of
 * the database transaction. A failed invalidation is logged and left to the
 * 60-second TTL: the write already succeeded and must not be reported as failed.
 */
export async function invalidateCatalogCacheAfterCommit(
  cache: CatalogCache,
  catalogKey: CatalogKey,
): Promise<void> {
  try {
    await cache.invalidate(catalogKey);
  } catch (error) {
    logger.warn(
      {
        err: error,
        cacheKey: catalogCacheKey(catalogKey),
        invalidationTrigger: "catalog value mutation",
      },
      "Reference catalog cache invalidation failed; the TTL bounds staleness",
    );
  }
}

/**
 * Lists every catalog and every value, including retired values. The Platform
 * editor needs both active and retired rows so it can reactivate a value.
 */
export async function listReferenceCatalogs(prisma: PrismaClient): Promise<CatalogList> {
  const catalogs = await prisma.catalog.findMany({
    orderBy: { key: "asc" },
    include: {
      values: {
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }, { code: "asc" }],
      },
    },
  });

  return {
    catalogs: catalogs.map((catalog) => ({
      key: catalog.key,
      label: catalog.label,
      description: catalog.description,
      isSystem: catalog.isSystem,
      values: catalog.values.map(toCatalogValue),
    })),
  };
}

/**
 * Creates one reference value. The catalog existence check, the unique
 * constraint and the audit row are one transaction; a duplicate code never
 * leaves a partial write (CT-7, invariant 4).
 */
export interface CatalogAdminContext {
  readonly prisma: PrismaClient;
  readonly cache: CatalogCache;
}

export async function createCatalogValue(
  context: CatalogAdminContext,
  input: CreateCatalogValueInput,
): Promise<CatalogValue> {
  const key = assertCatalogKey(input.category);
  const code = normalizeCode(key, input.body.code);

  const created = await context.prisma.$transaction(async (tx) => {
    await assertCatalogExists(tx, key);

    let createdRow: CatalogValueRow;
    try {
      createdRow = await tx.catalogValue.create({
        data: {
          catalogKey: key,
          code,
          label: input.body.label,
          sortOrder: input.body.sortOrder ?? 0,
          metadata: input.body.metadata ?? {},
          createdBy: input.operatorId,
          updatedBy: input.operatorId,
        },
      });
    } catch (error) {
      if (isDuplicateCodeError(error)) {
        throw new ConflictError(
          `The reference value "${code}" already exists in the ${key} catalog.`,
          { code: PLATFORM_ERROR_CODE.DUPLICATE_CODE },
        );
      }
      throw error;
    }

    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_CREATED,
      entityType: "catalog_value",
      entityId: `${key}:${code}`,
      before: null,
      after: toSnapshot(createdRow),
      requestId: input.requestId,
    });

    return toCatalogValue(createdRow);
  });
  await invalidateCatalogCacheAfterCommit(context.cache, key);
  return created;
}

const VERSION_CONFLICT_DETAIL =
  "The reference value changed since it was observed. Reload the catalog and retry.";

function buildUpdateChanges(
  input: UpdateCatalogValueInput,
): Prisma.CatalogValueUpdateManyMutationInput {
  const changes: Prisma.CatalogValueUpdateManyMutationInput = {
    version: { increment: 1 },
    updatedBy: input.operatorId,
  };
  if (input.body.label !== undefined) {
    changes.label = input.body.label;
  }
  if (input.body.sortOrder !== undefined) {
    changes.sortOrder = input.body.sortOrder;
  }
  if (input.body.isActive !== undefined) {
    changes.isActive = input.body.isActive;
  }
  if (input.body.metadata !== undefined) {
    changes.metadata = input.body.metadata;
  }
  return changes;
}

interface UpdateAuditInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: UpdateCatalogValueInput;
  readonly key: CatalogKey;
  readonly code: string;
  readonly before: CatalogValueRow;
  readonly after: CatalogValueRow;
}

async function appendUpdateAudit(context: UpdateAuditInput): Promise<void> {
  await appendPlatformAuditEvent(context.tx, {
    actorOperatorId: context.input.operatorId,
    action: PLATFORM_AUDIT_ACTIONS.CATALOG_VALUE_UPDATED,
    entityType: "catalog_value",
    entityId: `${context.key}:${context.code}`,
    before: toSnapshot(context.before),
    after: toSnapshot(context.after),
    requestId: context.input.requestId,
  });
}

/**
 * Updates or retires one reference value. The version guard is atomic: the
 * update only applies when the stored version still equals expectedVersion, so
 * two concurrent editors cannot overwrite each other (CT-3).
 */
export async function updateCatalogValue(
  context: CatalogAdminContext,
  input: UpdateCatalogValueInput,
): Promise<CatalogValue> {
  const key = assertCatalogKey(input.category);
  const code = normalizeCode(key, input.code);

  const updated = await context.prisma.$transaction(async (tx) => {
    if (input.body.isActive === false) {
      await assertFreshStepUp({
        operatorId: input.operatorId,
        token: input.stepUpToken,
      });
    }
    const current = await tx.catalogValue.findUnique({
      where: { catalogKey_code: { catalogKey: key, code } },
    });
    if (current === null) {
      throw new NotFoundError(
        `The reference value "${code}" does not exist in the ${key} catalog.`,
        { code: PLATFORM_ERROR_CODE.UNKNOWN_CATALOG },
      );
    }
    if (current.version !== input.body.expectedVersion) {
      throw new ConflictError(VERSION_CONFLICT_DETAIL, {
        code: PLATFORM_ERROR_CODE.CATALOG_VERSION_CONFLICT,
      });
    }

    const updated = await tx.catalogValue.updateMany({
      where: { id: current.id, version: input.body.expectedVersion },
      data: buildUpdateChanges(input),
    });
    if (updated.count === 0) {
      throw new ConflictError(VERSION_CONFLICT_DETAIL, {
        code: PLATFORM_ERROR_CODE.CATALOG_VERSION_CONFLICT,
      });
    }

    const next = await tx.catalogValue.findUnique({ where: { id: current.id } });
    if (next === null) {
      throw new InternalServerError("The reference value disappeared during the update.");
    }

    await appendUpdateAudit({
      tx,
      input,
      key,
      code,
      before: current,
      after: next,
    });
    return toCatalogValue(next);
  });
  await invalidateCatalogCacheAfterCommit(context.cache, key);
  return updated;
}
