import { Prisma, type PrismaClient } from "@prisma/client";

export interface TenantContext {
  organizationId: string;
  branchId?: string | null;
  userId?: string | null;
}

export class TenantIsolationViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationViolationError";
  }
}

interface ModelFieldSummary {
  hasOrgId: boolean;
  hasBranchId: boolean;
  isOrgRoot: boolean;
  modelKey: string;
}

// Build static lookup from DMMF metadata
const modelMetadataMap = new Map<string, ModelFieldSummary>();

for (const model of Prisma.dmmf.datamodel.models) {
  const modelKey = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  const fieldNames = new Set(model.fields.map((f) => f.name));

  const summary: ModelFieldSummary = {
    hasOrgId: fieldNames.has("organizationId"),
    hasBranchId: fieldNames.has("branchId"),
    isOrgRoot: model.name === "Organization",
    modelKey,
  };

  modelMetadataMap.set(model.name, summary);
  modelMetadataMap.set(modelKey, summary);
}

/**
 * Prisma Extension for Multi-Tenant Data Isolation.
 * Automatically injects tenant boundaries (organizationId & branchId) into read/write queries
 * and enforces strict checks on unique lookups and record mutations.
 *
 * Calls query() exactly once and guarantees immutable argument handling.
 */
export function tenantIsolationExtension(
  context: TenantContext,
  baseClient?: PrismaClient
) {
  if (!context.organizationId) {
    throw new TenantIsolationViolationError(
      "TenantContext requires a non-empty organizationId"
    );
  }

  return Prisma.defineExtension((client) => {
    // Resolve raw/unscoped client for ownership pre-checks without circular extension interception
    const rawClient = (baseClient ?? (client as Record<string, unknown>)._originalClient ?? client) as Record<
      string,
      Record<string, (args: unknown) => Promise<unknown>>
    >;

    return client.$extends({
      name: "tenant-isolation",
      client: {
        get $tenant(): TenantContext {
          return context;
        },
      },
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const meta = model ? modelMetadataMap.get(model) : undefined;
            const currentArgs = (args ?? {}) as Record<string, unknown>;

            // 1. Root Organization Model handling
            if (meta?.isOrgRoot) {
              return handleOrganizationOperation(
                operation,
                currentArgs,
                query,
                context
              );
            }

            // 2. Models containing organizationId
            if (meta?.hasOrgId) {
              return handleTenantModelOperation(
                operation,
                currentArgs,
                query,
                context,
                meta,
                rawClient
              );
            }

            // 3. System / Unscoped Models (e.g. Address, Verification)
            return query(currentArgs);
          },
        },
      },
    });
  });
}

async function handleOrganizationOperation(
  operation: string,
  args: Record<string, unknown>,
  query: (args: unknown) => Promise<unknown>,
  context: TenantContext
): Promise<unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;

  if (
    operation === "findMany" ||
    operation === "findFirst" ||
    operation === "findFirstOrThrow" ||
    operation === "count" ||
    operation === "aggregate"
  ) {
    return query({
      ...args,
      where: { ...where, id: context.organizationId },
    });
  }

  if (operation === "findUnique" || operation === "findUniqueOrThrow") {
    const result = (await query(args)) as { id?: string } | null;
    if (result && result.id !== context.organizationId) {
      if (operation === "findUniqueOrThrow") {
        throw new TenantIsolationViolationError(
          "Cross-tenant access prohibited for organization"
        );
      }
      return null;
    }
    return result;
  }

  if (operation === "update" || operation === "delete") {
    if (where.id && where.id !== context.organizationId) {
      throw new TenantIsolationViolationError(
        `Cannot mutate organization with id ${String(where.id)} outside current tenant ${context.organizationId}`
      );
    }
    return query({
      ...args,
      where: { ...where, id: context.organizationId },
    });
  }

  if (operation === "create" || operation === "createMany") {
    throw new TenantIsolationViolationError(
      "Tenants cannot create new organizations via tenant client context"
    );
  }

  return query(args);
}

async function handleTenantModelOperation(
  operation: string,
  args: Record<string, unknown>,
  query: (args: unknown) => Promise<unknown>,
  context: TenantContext,
  meta: ModelFieldSummary,
  rawClient: Record<string, Record<string, (args: unknown) => Promise<unknown>>>
): Promise<unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;

  // Build the scoping filter
  const tenantFilter: Record<string, unknown> = {
    organizationId: context.organizationId,
  };

  if (meta.hasBranchId && context.branchId) {
    tenantFilter.branchId = context.branchId;
  }

  // --- READS ---
  if (
    operation === "findMany" ||
    operation === "findFirst" ||
    operation === "findFirstOrThrow" ||
    operation === "count" ||
    operation === "aggregate" ||
    operation === "groupBy"
  ) {
    // Special handling for Role: allow tenant roles OR system roles (orgId = null) when reading
    const scopedWhere =
      meta.modelKey === "role" && !where.organizationId
        ? {
            ...where,
            OR: [
              { organizationId: context.organizationId },
              { organizationId: null },
            ],
          }
        : {
            ...where,
            ...tenantFilter,
          };

    return query({
      ...args,
      where: scopedWhere,
    });
  }

  if (operation === "findUnique" || operation === "findUniqueOrThrow") {
    const result = (await query(args)) as {
      organizationId?: string | null;
      branchId?: string | null;
    } | null;

    if (result) {
      // Role can be global system role
      const isAllowedRole =
        meta.modelKey === "role" &&
        (result.organizationId === null || result.organizationId === context.organizationId);

      if (
        !isAllowedRole &&
        result.organizationId &&
        result.organizationId !== context.organizationId
      ) {
        if (operation === "findUniqueOrThrow") {
          throw new TenantIsolationViolationError(
            "Cross-tenant access prohibited for model: record belongs to another organization"
          );
        }
        return null;
      }

      if (
        meta.hasBranchId &&
        context.branchId &&
        result.branchId &&
        result.branchId !== context.branchId
      ) {
        if (operation === "findUniqueOrThrow") {
          throw new TenantIsolationViolationError(
            `Branch-scoped access prohibited: record belongs to branch ${result.branchId}`
          );
        }
        return null;
      }
    }

    return result;
  }

  // --- WRITES ---
  if (operation === "create") {
    const rawData = (args.data ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {
      ...rawData,
      organizationId: context.organizationId,
    };
    if (meta.hasBranchId && context.branchId) {
      data.branchId = context.branchId;
    }
    return query({
      ...args,
      data,
    });
  }

  if (operation === "createMany") {
    let data = args.data;
    if (Array.isArray(data)) {
      data = data.map((item) => {
        const enriched: Record<string, unknown> = {
          ...item,
          organizationId: context.organizationId,
        };
        if (meta.hasBranchId && context.branchId) {
          enriched.branchId = context.branchId;
        }
        return enriched;
      });
    } else if (data && typeof data === "object") {
      const enriched: Record<string, unknown> = {
        ...(data as Record<string, unknown>),
        organizationId: context.organizationId,
      };
      if (meta.hasBranchId && context.branchId) {
        enriched.branchId = context.branchId;
      }
      data = enriched;
    }
    return query({
      ...args,
      data,
    });
  }

  if (operation === "updateMany" || operation === "deleteMany") {
    return query({
      ...args,
      where: {
        ...where,
        ...tenantFilter,
      },
    });
  }

  if (operation === "update" || operation === "delete") {
    // 1. Prevent cross-tenant reassignment of organizationId
    if (operation === "update") {
      const data = (args.data ?? {}) as Record<string, unknown>;
      if (data.organizationId && data.organizationId !== context.organizationId) {
        throw new TenantIsolationViolationError(
          "Reassigning organizationId across tenants is prohibited"
        );
      }
    }

    // 2. Query target record using raw un-scoped client to check ownership
    const delegate = rawClient[meta.modelKey];
    if (delegate && typeof delegate.findFirst === "function") {
      const existing = (await delegate.findFirst({
        where,
        select: {
          organizationId: true,
          ...(meta.hasBranchId ? { branchId: true } : {}),
        },
      }).catch(() => null)) as {
        organizationId?: string | null;
        branchId?: string | null;
      } | null;

      if (existing) {
        // Protect global system roles from mutation/deletion
        if (meta.modelKey === "role" && existing.organizationId === null) {
          throw new TenantIsolationViolationError(
            "Mutating or deleting global system roles is strictly prohibited"
          );
        }

        // Cross-tenant check
        if (
          existing.organizationId &&
          existing.organizationId !== context.organizationId
        ) {
          throw new TenantIsolationViolationError(
            "Cross-tenant mutation prohibited: record belongs to another organization"
          );
        }

        // Branch-scoped check
        if (
          meta.hasBranchId &&
          context.branchId &&
          existing.branchId &&
          existing.branchId !== context.branchId
        ) {
          throw new TenantIsolationViolationError(
            `Branch-scoped mutation prohibited: record belongs to branch ${existing.branchId}`
          );
        }
      }
    }

    // 3. Ownership is verified! Call query(args) EXACTLY ONCE with immutable args.
    return query(args);
  }

  if (operation === "upsert") {
    const rawCreate = (args.create ?? {}) as Record<string, unknown>;
    const rawUpdate = (args.update ?? {}) as Record<string, unknown>;

    if (rawUpdate.organizationId && rawUpdate.organizationId !== context.organizationId) {
      throw new TenantIsolationViolationError(
        "Reassigning organizationId across tenants is prohibited"
      );
    }

    const createData: Record<string, unknown> = {
      ...rawCreate,
      organizationId: context.organizationId,
    };
    if (meta.hasBranchId && context.branchId) {
      createData.branchId = context.branchId;
    }

    return query({
      ...args,
      create: createData,
      update: rawUpdate,
    });
  }

  return query(args);
}
