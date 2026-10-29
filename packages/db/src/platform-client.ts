import { PrismaClient } from "@prisma/client";

export interface PlatformPrismaClientOptions {
  readonly databaseUrl: string;
}

/**
 * Creates a Prisma client bound to the app_platform runtime identity.
 *
 * The caller owns the instance: the API creates one at startup, while tests
 * create one per database identity so the boundary can be exercised.
 */
export function createPlatformPrismaClient(
  options: PlatformPrismaClientOptions
): PrismaClient {
  return new PrismaClient({
    datasourceUrl: options.databaseUrl,
    log: ["error"],
  });
}

export async function disconnectPlatformPrismaClient(
  client: PrismaClient
): Promise<void> {
  await client.$disconnect();
}
