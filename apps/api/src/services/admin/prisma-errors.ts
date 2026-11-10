import { Prisma } from "@suite/db";

/**
 * One Prisma unique-constraint predicate for every admin service (P2002).
 * Pass a field to distinguish which unique index was hit; without one, any
 * unique violation matches.
 */
export function isUniqueConstraintViolation(
  error: unknown,
  field?: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (field === undefined) return true;
  const target = error.meta?.target;
  if (typeof target === "string") return target.includes(field);
  if (Array.isArray(target)) return target.some((entry) => entry === field);
  return false;
}
