import { PrismaClient, Prisma } from "@prisma/client";
import {
  tenantIsolationExtension,
  type TenantContext,
} from "./extension.js";

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

export type TenantPrismaClient = ReturnType<typeof createTenantPrismaClient>;

/**
 * Creates a Tenant-Scoped Prisma Client using Prisma $extends.
 * Transparently isolates all queries to the specified organizationId (and optional branchId).
 */
export function createTenantPrismaClient(
  baseClient: PrismaClient = prisma,
  context: TenantContext
) {
  return baseClient.$extends(tenantIsolationExtension(context));
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
