import { PrismaClient } from "@suite/db";

/**
 * OP-6 retention for the Platform flag audit log. Runs as the owner identity
 * from the scheduled workflow; app_platform intentionally has no DELETE grant.
 */
const RETENTION_MONTHS = 24;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required");
  }
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
    const result = await prisma.featureFlagAuditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.log(
      "Pruned " +
        result.count +
        " flag audit rows older than " +
        cutoff.toISOString()
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
