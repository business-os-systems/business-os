/**
 * DB-free flag contracts for consumers that must not load the Redis/Prisma
 * client (the Platform UI). The root entry point exports FeatureFlagClient,
 * which imports @suite/db.
 */
export * from "./types.js";
