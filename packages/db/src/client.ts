import { PrismaClient, Prisma } from "@prisma/client";
import {
  tenantIsolationExtension,
  type TenantContext,
} from "./extension.js";
import { getTenantDatabaseUrl, isDevelopmentRuntime } from "./env.js";
import { TENANT_CONTEXT_SETTING } from "./quota-guard.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Platform Core Master PrismaClient (Root / System Context).
 * Unscoped database client for migrations, seeds, background workers, and cross-tenant admin operations.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let tenantRuntimeClient: PrismaClient | null = null;

/**
 * The tenant plane connects with the app_tenant identity, never the owner or
 * app_platform role. RLS policies read app.current_organization_id, so a query
 * outside a tenant transaction sees no rows.
 */
export function getTenantRuntimeClient(): PrismaClient {
  const url = getTenantDatabaseUrl();
  tenantRuntimeClient ??= new PrismaClient({
    datasources: { db: { url } },
    log: isDevelopmentRuntime() ? ["error", "warn"] : ["error"],
  });
  return tenantRuntimeClient;
}

export async function disconnectTenantRuntimeClient(): Promise<void> {
  if (tenantRuntimeClient !== null) {
    await tenantRuntimeClient.$disconnect();
    tenantRuntimeClient = null;
  }
}

export interface TenantContextTransactionOptions {
  readonly maxWait?: number;
  readonly timeout?: number;
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Runs tenant work as app_tenant inside a transaction whose first statement sets
 * the transaction-local organization context. Every statement in the callback
 * is subject to the RLS policy for that organization.
 */
export async function withTenantContext<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TenantContextTransactionOptions,
): Promise<T> {
  if (organizationId.trim() === "") {
    throw new Error("withTenantContext requires an organization id.");
  }
  const client = getTenantRuntimeClient();
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${organizationId}, true)`;
    return fn(tx);
  }, options);
}

export type TenantPrismaClient = ReturnType<typeof createTenantPrismaClient>;

/**
 * Creates a Tenant-Scoped Prisma Client using Prisma $extends.
 * Transparently isolates all queries to the specified organizationId (and optional branchId).
 */
export function createTenantPrismaClient(
  baseClient: PrismaClient = prisma,
  context: TenantContext
) {
  return baseClient.$extends(tenantIsolationExtension(context, baseClient));
}

/**
 * Standard Tenant Database Client Getter.
 * Resolves or creates a tenant-isolated Prisma Client for the active organization and branch.
 */
export function getTenantDb(
  organizationId: string,
  branchId?: string | null,
  baseClient: PrismaClient = prisma
): TenantPrismaClient {
  return createTenantPrismaClient(baseClient, { organizationId, branchId });
}

/**
 * Executes a function within a root database transaction.
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  },
  client: PrismaClient = prisma
): Promise<T> {
  return client.$transaction(fn, options);
}

/**
 * Executes a function within a tenant-scoped database transaction.
 */
export async function withTenantTransaction<T>(
  context: TenantContext,
  fn: (txClient: TenantPrismaClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  },
  client: PrismaClient = prisma
): Promise<T> {
  const tenantClient = createTenantPrismaClient(client, context);
  return tenantClient.$transaction(
    (tx) => fn(tx as unknown as TenantPrismaClient),
    options
  );
}
