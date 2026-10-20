import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import { hashPassword, verifyPassword, validatePasswordComplexity } from "../password/password-engine.js";

export const PASSWORD_RESET_EXPIRATION_MINUTES = 15;
export const PASSWORD_RESET_EXPIRATION_MS = PASSWORD_RESET_EXPIRATION_MINUTES * 60 * 1000;

export const ACCOUNT_LINKING_TICKET_EXPIRATION_MINUTES = 5;
export const ACCOUNT_LINKING_TICKET_EXPIRATION_MS = ACCOUNT_LINKING_TICKET_EXPIRATION_MINUTES * 60 * 1000;

export interface PasswordResetTokenResult {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export type VerifyPasswordResetTokenResult =
  | { success: true; email: string }
  | { success: false; reason: "INVALID" }
  | { success: false; reason: "EXPIRED" };

export interface CompletePasswordResetParams {
  token: string;
  newPassword: string;
  prisma: PrismaClient;
}

export type CompletePasswordResetResult =
  | { success: true; userId: string; email: string }
  | { success: false; reason: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "PASSWORD_COMPLEXITY_FAILED" | "USER_NOT_FOUND"; error?: string };

export interface AccountLinkingTicketPayload {
  email: string;
  providerId: string;
  accountId: string;
  name?: string;
  image?: string;
  exp: number; // Unix timestamp in milliseconds
}

export interface CreateAccountLinkingTicketParams {
  email: string;
  providerId: string;
  accountId: string;
  name?: string;
  image?: string;
  secretKey: string;
}

export interface LinkOAuthAccountParams {
  ticket: string;
  password: string;
  prisma: PrismaClient;
  secretKey: string;
}

export type LinkOAuthAccountResult =
  | { success: true; userId: string; email: string; providerId: string; accountId: string }
  | { success: false; reason: "INVALID_TICKET" | "EXPIRED_TICKET" | "INVALID_PASSWORD" | "USER_NOT_FOUND" | "CREDENTIAL_NOT_FOUND" | "ALREADY_LINKED" };

/**
 * Computes deterministic SHA-256 hash for reset token storage.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates and stores a 15-minute single-use password reset token in PostgreSQL verifications.
 */
export async function createPasswordResetToken(
  email: string,
  prisma: PrismaClient
): Promise<PasswordResetTokenResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRATION_MS);

  // Clear previous pending password reset tokens for this email
  await prisma.verification.deleteMany({
    where: { identifier: `reset:${normalizedEmail}` },
  });

  await prisma.verification.create({
    data: {
      identifier: `reset:${normalizedEmail}`,
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
 * Validates a submitted password reset token without consuming it (for GET route check).
 */
export async function verifyPasswordResetToken(
  rawToken: string,
  prisma: PrismaClient
): Promise<VerifyPasswordResetTokenResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim() === "") {
    return { success: false, reason: "INVALID" };
  }

  const tokenHash = hashToken(rawToken.trim());
  const record = await prisma.verification.findFirst({
    where: { value: tokenHash },
  });

  if (!record || !record.identifier.startsWith("reset:")) {
    return { success: false, reason: "INVALID" };
  }

  if (record.expiresAt < new Date()) {
    try {
      await prisma.verification.delete({ where: { id: record.id } });
    } catch {
      // Ignore cleanup error
    }
    return { success: false, reason: "EXPIRED" };
  }

  const email = record.identifier.slice(6);
  return { success: true, email };
}

/**
 * Completes password reset: validates token, verifies complexity, updates password hash,
 * consumes token, and atomically revokes ALL active user sessions across all devices.
 */
export async function completePasswordReset({
  token,
  newPassword,
  prisma,
}: CompletePasswordResetParams): Promise<CompletePasswordResetResult> {
  // 1. Validate password complexity
  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.isValid) {
    const errorDetails: string[] = [];
    if (!complexity.hasMinLength) errorDetails.push("Password must be at least 12 characters long");
    if (!complexity.hasUppercase) errorDetails.push("Password must contain at least 1 uppercase letter");
    if (!complexity.hasNumber) errorDetails.push("Password must contain at least 1 number");
    if (!complexity.hasSpecialSymbol) errorDetails.push("Password must contain at least 1 special symbol");

    return {
      success: false,
      reason: "PASSWORD_COMPLEXITY_FAILED",
      error: errorDetails[0] || "Password does not meet complexity requirements",
    };
  }

  // 2. Validate token
  const tokenCheck = await verifyPasswordResetToken(token, prisma);
  if (!tokenCheck.success) {
    return {
      success: false,
      reason: tokenCheck.reason === "EXPIRED" ? "EXPIRED_TOKEN" : "INVALID_TOKEN",
    };
  }

  // 3. Find user and their credential account
  const user = await prisma.user.findUnique({
    where: { email: tokenCheck.email },
    include: {
      accounts: {
        where: { providerId: "credential" },
      },
    },
  });

  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  const newPasswordHash = await hashPassword(newPassword);
  const tokenHash = hashToken(token.trim());

  // 4. Atomic transaction: update password, delete token, and revoke ALL active sessions
  await prisma.$transaction(async (tx) => {
    // Upsert or update credential account
    if (user.accounts.length > 0 && user.accounts[0]) {
      await tx.account.update({
        where: { id: user.accounts[0].id },
        data: { password: newPasswordHash },
      });
    } else {
      await tx.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.email,
          password: newPasswordHash,
        },
      });
    }

    // Purge reset verification record
    await tx.verification.deleteMany({
      where: { value: tokenHash },
    });

    // SECURITY MANDATE: Invalidate all active sessions globally across all devices
    await tx.session.deleteMany({
      where: { userId: user.id },
    });
  });

  return {
    success: true,
    userId: user.id,
    email: user.email,
  };
}

/**
 * Creates a cryptographically signed, tamper-proof 5-minute ticket for OAuth collision resolution.
 */
export function createAccountLinkingTicket({
  email,
  providerId,
  accountId,
  name,
  image,
  secretKey,
}: CreateAccountLinkingTicketParams): string {
  const payload: AccountLinkingTicketPayload = {
    email: email.toLowerCase().trim(),
    providerId,
    accountId,
    name,
    image,
    exp: Date.now() + ACCOUNT_LINKING_TICKET_EXPIRATION_MS,
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secretKey).update(payloadString).digest("base64url");

  return `${payloadString}.${signature}`;
}

/**
 * Validates and decodes an OAuth linking ticket.
 */
export function verifyAccountLinkingTicket(
  ticket: string,
  secretKey: string
): AccountLinkingTicketPayload | null {
  if (!ticket || typeof ticket !== "string") return null;

  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [payloadString, signature] = parts;

  const expectedSignature = createHmac("sha256", secretKey).update(payloadString).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadString, "base64url").toString("utf-8")) as AccountLinkingTicketPayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Links a federated OAuth account to an existing credential user upon password confirmation.
 */
export async function linkOAuthAccountWithPassword({
  ticket,
  password,
  prisma,
  secretKey,
}: LinkOAuthAccountParams): Promise<LinkOAuthAccountResult> {
  const payload = verifyAccountLinkingTicket(ticket, secretKey);
  if (!payload) {
    return { success: false, reason: "INVALID_TICKET" };
  }

  const user = await prisma.user.findUnique({
    where: { email: payload.email },
    include: {
      accounts: true,
    },
  });

  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  // Find existing credential account to verify password
  const credentialAccount = user.accounts.find((a) => a.providerId === "credential");
  if (!credentialAccount || !credentialAccount.password) {
    return { success: false, reason: "CREDENTIAL_NOT_FOUND" };
  }

  const isPasswordValid = await verifyPassword(password, credentialAccount.password);
  if (!isPasswordValid) {
    return { success: false, reason: "INVALID_PASSWORD" };
  }

  // Check if provider is already linked
  const existingProvider = user.accounts.find(
    (a) => a.providerId === payload.providerId && a.accountId === payload.accountId
  );

  if (existingProvider) {
    return {
      success: true,
      userId: user.id,
      email: user.email,
      providerId: payload.providerId,
      accountId: payload.accountId,
    };
  }

  // Create linked provider Account
  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: payload.providerId,
      accountId: payload.accountId,
    },
  });

  return {
    success: true,
    userId: user.id,
    email: user.email,
    providerId: payload.providerId,
    accountId: payload.accountId,
  };
}
