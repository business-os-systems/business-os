import {
  createPlatformPrismaClient,
  Prisma,
  type PrismaClient,
} from "@suite/db";

/**
 * Tables owned by the Platform and Reference schemas.
 *
 * The owner client resets these between integration tests; the app_platform
 * client is used to exercise the real runtime grants.
 */
export const PLATFORM_SCHEMA_TABLES = [
  "platform.operators",
  "platform.operator_passkeys",
  "platform.operator_sessions",
  "platform.operator_capabilities",
  "platform.operator_invitations",
  "platform.lifecycle_events",
  "platform.quotas",
  "platform.app_overrides",
  "platform.app_settings_defaults",
  "platform.impersonation_sessions",
  "platform.audit_events",
  "platform.outbox_events",
  "reference.catalog_values",
  "reference.catalogs",
] as const;

export type PlatformSchemaTable = (typeof PLATFORM_SCHEMA_TABLES)[number];

function readOptionalUrl(name: "PLATFORM_DATABASE_URL" | "DIRECT_URL"): string | null {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function requireUrl(value: string | null, name: string): string {
  if (value === null) {
    throw new Error(
      `${name} must be set to run Platform integration tests against PostgreSQL`
    );
  }
  return value;
}

export function getPlatformDatabaseUrl(): string | null {
  return readOptionalUrl("PLATFORM_DATABASE_URL");
}

export function getPlatformOwnerDatabaseUrl(): string | null {
  return readOptionalUrl("DIRECT_URL");
}

/**
 * True only when both the runtime identity and the owner identity are
 * declared. Suites use this to skip explicitly, never silently.
 */
export function platformIntegrationTestsEnabled(): boolean {
  return (
    getPlatformDatabaseUrl() !== null &&
    getPlatformOwnerDatabaseUrl() !== null
  );
}

export function createPlatformTestClient(): PrismaClient {
  return createPlatformPrismaClient({
    databaseUrl: requireUrl(
      getPlatformDatabaseUrl(),
      "PLATFORM_DATABASE_URL"
    ),
  });
}

export function createPlatformOwnerTestClient(): PrismaClient {
  return createPlatformPrismaClient({
    databaseUrl: requireUrl(getPlatformOwnerDatabaseUrl(), "DIRECT_URL"),
  });
}

export async function resetPlatformSchema(
  ownerClient: PrismaClient
): Promise<void> {
  const tables = PLATFORM_SCHEMA_TABLES.map((table) => Prisma.raw(table));
  await ownerClient.$executeRaw(
    Prisma.sql`TRUNCATE TABLE ${Prisma.join(tables)} RESTART IDENTITY CASCADE`
  );
}

export async function disconnectPlatformTestClient(
  client: PrismaClient
): Promise<void> {
  await client.$disconnect();
}
