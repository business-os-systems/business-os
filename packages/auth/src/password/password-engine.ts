import { hash, verify, type Algorithm } from "@node-rs/argon2";
export {
  validatePasswordComplexity,
  type PasswordComplexityResult,
} from "./password-rules.js";

/**
 * High-security cryptographic parameters for Argon2id password hashing:
 * - Algorithm: Argon2id (hybrid data-independent and data-dependent memory access)
 * - Memory Cost: 65,536 KiB (64 MiB)
 * - Time Cost: 3 iterations
 * - Parallelism: 1 lane
 * - Output Length: 32 bytes
 */
export const ARGON2ID_PASSWORD_OPTIONS = {
  algorithm: 2 as Algorithm, // Argon2id numeric constant (avoids ambient const enum isolatedModules issue)
  memoryCost: 65536,
  timeCost: 3,
  outputLen: 32,
  parallelism: 1,
} as const;

/**
 * Hashes a plain-text password using Argon2id.
 *
 * @param password The plain-text password to hash.
 * @returns Standard Argon2id encoded hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  return hash(password, ARGON2ID_PASSWORD_OPTIONS);
}

/**
 * Verifies a plain-text candidate password against an Argon2id hash.
 *
 * @param password The plain-text candidate password.
 * @param hashedPassword The stored Argon2id hash string.
 * @returns True if the password matches, false otherwise.
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  if (!password || !hashedPassword) {
    return false;
  }

  try {
    return await verify(hashedPassword, password);
  } catch {
    return false;
  }
}
