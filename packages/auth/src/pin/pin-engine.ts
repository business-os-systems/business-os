import { hash, verify, type Algorithm } from "@node-rs/argon2";

/**
 * High-security cryptographic parameters for Argon2id PIN hashing:
 * - Algorithm: Argon2id (hybrid data-independent and data-dependent memory access)
 * - Memory Cost: 65,536 KiB (64 MiB)
 * - Time Cost: 3 iterations
 * - Parallelism: 1 lane
 * - Output Length: 32 bytes
 */
export const ARGON2ID_PIN_OPTIONS = {
  algorithm: 2 as Algorithm, // Argon2id numeric constant (avoids ambient const enum isolatedModules issue)
  memoryCost: 65536,
  timeCost: 3,
  outputLen: 32,
  parallelism: 1,
} as const;

/**
 * Hashes a numeric PIN using Argon2id.
 *
 * @param pin The plain-text numeric PIN to hash.
 * @returns Standard Argon2id encoded hash string.
 */
export async function hashPin(pin: string): Promise<string> {
  if (!pin || typeof pin !== "string") {
    throw new Error("PIN must be a non-empty string");
  }

  return hash(pin, ARGON2ID_PIN_OPTIONS);
}

/**
 * Verifies a plain-text PIN against an Argon2id hash.
 *
 * @param pin The plain-text candidate PIN.
 * @param hashedPin The stored Argon2id hash string.
 * @returns True if the PIN matches, false otherwise.
 */
export async function verifyPin(pin: string, hashedPin: string): Promise<boolean> {
  if (!pin || !hashedPin) {
    return false;
  }

  try {
    return await verify(hashedPin, pin);
  } catch {
    return false;
  }
}
