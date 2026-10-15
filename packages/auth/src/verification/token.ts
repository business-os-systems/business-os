import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@suite/db";

export const EMAIL_VERIFICATION_EXPIRATION_HOURS = 24;
export const EMAIL_VERIFICATION_EXPIRATION_MS =
  EMAIL_VERIFICATION_EXPIRATION_HOURS * 60 * 60 * 1000;

export interface CreateVerificationTokenResult {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export type VerifyEmailResult =
  | { success: true; email: string; userId: string }
  | { success: false; reason: "INVALID" }
  | { success: false; reason: "EXPIRED"; email: string };

/**
 * Computes a deterministic SHA-256 hash for secure token storage.
 */
export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates and stores a cryptographically secure 24-hour verification token for a given email address.
 * Automatically purges previous pending tokens for this email to prevent replay attacks.
 */
export async function createEmailVerificationToken(
  email: string,
  prisma: PrismaClient
): Promise<CreateVerificationTokenResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRATION_MS);

  // Remove existing pending verification records for this email
  await prisma.verification.deleteMany({
    where: { identifier: normalizedEmail },
  });

  // Store new verification record
  await prisma.verification.create({
    data: {
      identifier: normalizedEmail,
      value: tokenHash,
      expiresAt,
    },
  });

  return {
    rawToken,
    tokenHash,
    expiresAt,
  };
}

/**
 * Validates a submitted verification token, verifies its expiration boundary,
 * marks User.emailVerified = true, and purges the consumed token record atomically.
 */
export async function verifyEmailToken(
  rawToken: string,
  prisma: PrismaClient
): Promise<VerifyEmailResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim() === "") {
    return { success: false, reason: "INVALID" };
  }

  const tokenHash = hashVerificationToken(rawToken.trim());

  // 1. Seek token record in verifications table
  const record = await prisma.verification.findFirst({
    where: { value: tokenHash },
  });

  if (!record) {
    return { success: false, reason: "INVALID" };
  }

  // 2. Validate expiration (24-hour boundary)
  if (record.expiresAt < new Date()) {
    // Purge expired token
    try {
      await prisma.verification.delete({
        where: { id: record.id },
      });
    } catch {
      // Ignore deletion errors on expired cleanup
    }

    return { success: false, reason: "EXPIRED", email: record.identifier };
  }

  // 3. Find and update the user record
  const user = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true, email: true },
  });

  if (!user) {
    return { success: false, reason: "INVALID" };
  }

  // Atomic update: Mark verified and consume token
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    }),
    prisma.verification.delete({
      where: { id: record.id },
    }),
  ]);

  return {
    success: true,
    email: user.email,
    userId: user.id,
  };
}
