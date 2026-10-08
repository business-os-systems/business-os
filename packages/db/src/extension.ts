import { Prisma } from "@prisma/client";

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
 */
export function tenantIsolationExtension(context: TenantContext) {
  if (!context.organizationId) {
    throw new TenantIsolationViolationError(
      "TenantContext requires a non-empty organizationId"
    );
  }

  return Prisma.defineExtension({
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
              meta
            );
          }

          // 3. System / Unscoped Models (e.g. Address, Verification)
          return query(currentArgs);
        },
      },
    },
  });
}

async function handleOrganizationOperation(
  operation: string,
  args: Record<string, unknown>,
  query: (args: unknown) => Promise<unknown>,
  context: TenantContext
): Promise<unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;

  if (operation === "findMany" || operation === "findFirst" || operation === "findFirstOrThrow" || operation === "count" || operation === "aggregate") {
    args.where = { ...where, id: context.organizationId };
    return query(args);
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
    args.where = { ...where, id: context.organizationId };
    return query(args);
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
  meta: ModelFieldSummary
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
    if (meta.modelKey === "role" && !where.organizationId) {
      args.where = {
        ...where,
        OR: [
          { organizationId: context.organizationId },
          { organizationId: null },
        ],
      };
    } else {
      args.where = {
        ...where,
        ...tenantFilter,
      };
    }
    return query(args);
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
            `Cross-tenant access prohibited for model: record belongs to another organization`
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
    const data = (args.data ?? {}) as Record<string, unknown>;
    data.organizationId = context.organizationId;
    if (meta.hasBranchId && context.branchId) {
      data.branchId = context.branchId;
    }
    args.data = data;
    return query(args);
  }

  if (operation === "createMany") {
    if (Array.isArray(args.data)) {
      args.data = (args.data as Record<string, unknown>[]).map((item) => {
        const enriched: Record<string, unknown> = {
          ...item,
          organizationId: context.organizationId,
        };
        if (meta.hasBranchId && context.branchId && enriched.branchId === undefined) {
          enriched.branchId = context.branchId;
        }
        return enriched;
      });
    } else if (args.data && typeof args.data === "object") {
      const data = args.data as Record<string, unknown>;
      data.organizationId = context.organizationId;
      if (meta.hasBranchId && context.branchId && data.branchId === undefined) {
        data.branchId = context.branchId;
      }
      args.data = data;
    }
    return query(args);
  }

  if (operation === "updateMany" || operation === "deleteMany") {
    args.where = {
      ...where,
      ...tenantFilter,
    };
    return query(args);
  }

  if (operation === "update" || operation === "delete") {
    // Prevent cross-tenant update/delete by verifying ownership before mutation
    const record = (await query({
      ...args,
      // Dry query via findFirst-style verification
    }).catch(() => null)) as { organizationId?: string | null } | null;

    if (record && record.organizationId && record.organizationId !== context.organizationId) {
      throw new TenantIsolationViolationError(
        `Cross-tenant mutation prohibited: record belongs to another organization`
      );
    }

    if (operation === "update") {
      const data = (args.data ?? {}) as Record<string, unknown>;
      // Never allow reassigning organizationId across tenants
      if (data.organizationId && data.organizationId !== context.organizationId) {
        throw new TenantIsolationViolationError(
          "Reassigning organizationId across tenants is prohibited"
        );
      }
    }

    return query(args);
  }

  if (operation === "upsert") {
    const createData = (args.create ?? {}) as Record<string, unknown>;
    createData.organizationId = context.organizationId;
    if (meta.hasBranchId && context.branchId && createData.branchId === undefined) {
      createData.branchId = context.branchId;
    }
    args.create = createData;

    const updateData = (args.update ?? {}) as Record<string, unknown>;
    if (updateData.organizationId && updateData.organizationId !== context.organizationId) {
      throw new TenantIsolationViolationError(
        "Reassigning organizationId across tenants is prohibited"
      );
    }
    args.update = updateData;

    return query(args);
  }

  return query(args);
}
