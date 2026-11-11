import { Prisma } from "@suite/db";

/**
 * Returns the target columns of a Prisma P2002 unique violation, or null for
 * every other failure. The meta payload is narrowed without a cast so an
 * unexpected driver shape fails the safe way (no target, no special case).
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

