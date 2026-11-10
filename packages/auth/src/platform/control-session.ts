import { z } from "zod";
import type { PrismaClient } from "@suite/db";
import { sha256Hex } from "../crypto/hmac.js";
import {
  getSessionCookieSameSite,
  type SessionCookieSameSite,
} from "../env.js";
import { signPlatformToken, verifyPlatformToken } from "./token.js";

export const CONTROL_SESSION_COOKIE_NAME = "__Host-bos_ops";
export const CONTROL_SESSION_AUDIENCE = "ops" as const;
export const CONTROL_SESSION_ISSUER = "business-os-platform" as const;
export const CONTROL_SESSION_IDLE_SECONDS = 30 * 60;
export const CONTROL_SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;

const controlSessionClaimsSchema = z.object({
  aud: z.literal(CONTROL_SESSION_AUDIENCE),
  iss: z.literal(CONTROL_SESSION_ISSUER),
  sub: z.string().min(1),
  sid: z.string().min(1),
  jti: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  idleExp: z.number().int().positive(),
});

export type ControlSessionClaims = z.infer<typeof controlSessionClaimsSchema>;

export interface ControlSessionCookieOptions {
  readonly name: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: SessionCookieSameSite;
  readonly path: "/";
  readonly maxAge: number;
}

export type ControlSessionFailureReason =
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "idle_timeout"
  | "revoked"
  | "rp_mismatch"
  | "not_found"
  | "operator_inactive";

export type ControlSessionVerification =
  | {
      readonly valid: true;
      readonly operatorId: string;
      readonly sessionId: string;
      readonly expiresAt: Date;
      readonly idleExpiresAt: Date;
    }
  | { readonly valid: false; readonly reason: ControlSessionFailureReason };

export interface IssueControlSessionInput {
  readonly prisma: Pick<PrismaClient, "operatorSession">;
  readonly secret: string;
  readonly operatorId: string;
  /** The relying-party identity the operator authenticated against. */
  readonly rpID: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly now?: Date;
}

export interface IssuedControlSession {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
  readonly idleExpiresAt: Date;
  readonly cookie: ControlSessionCookieOptions;
}

export interface VerifyControlSessionInput {
  readonly prisma: PrismaClient;
  readonly secret: string;
  readonly token: string;
  /** The currently configured relying-party identity. */
  readonly rpID: string;
  readonly now?: Date;
}

export interface TouchControlSessionInput {
  readonly prisma: PrismaClient;
  readonly sessionId: string;
  readonly now?: Date;
}

export interface RevokeControlSessionInput {
  readonly prisma: PrismaClient;
  readonly sessionId: string;
  readonly now?: Date;
}

export function createControlSessionCookieOptions(): ControlSessionCookieOptions {
  return {
    name: CONTROL_SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: true,
    sameSite: getSessionCookieSameSite(),
    path: "/",
    maxAge: CONTROL_SESSION_ABSOLUTE_SECONDS,
  };
}

export async function issueControlSession(
  input: IssueControlSessionInput
): Promise<IssuedControlSession> {
  const now = input.now ?? new Date();
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + CONTROL_SESSION_ABSOLUTE_SECONDS * 1000
  );
  const idleExpiresAt = new Date(
    Math.min(
      now.getTime() + CONTROL_SESSION_IDLE_SECONDS * 1000,
      expiresAt.getTime()
    )
  );

  const claims: ControlSessionClaims = {
    aud: CONTROL_SESSION_AUDIENCE,
    iss: CONTROL_SESSION_ISSUER,
    sub: input.operatorId,
    sid: sessionId,
    jti,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    idleExp: Math.floor(idleExpiresAt.getTime() / 1000),
  };

  const token = await signPlatformToken(claims, input.secret);
  const tokenHash = await sha256Hex(token);

  await input.prisma.operatorSession.create({
    data: {
      id: sessionId,
      operatorId: input.operatorId,
      tokenHash,
      issuedAt: now,
      expiresAt,
      idleExpiresAt,
      rpId: input.rpID,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
    },
  });

  return {
    token,
    sessionId,
    expiresAt,
    idleExpiresAt,
    cookie: createControlSessionCookieOptions(),
  };
}

async function revokeStaleReliance(
  prisma: PrismaClient,
  sessionId: string,
  now: Date
): Promise<void> {
  await revokeControlSession({ prisma, sessionId, now });
}

export async function verifyControlSession(
  input: VerifyControlSessionInput
): Promise<ControlSessionVerification> {
  if (!input.token) {
    return { valid: false, reason: "missing" };
  }
  if (input.token.split(".").length !== 2) {
    return { valid: false, reason: "malformed" };
  }

  const payload = await verifyPlatformToken(input.token, input.secret);
  if (payload === null) {
    return { valid: false, reason: "invalid_signature" };
  }

  const claimsResult = controlSessionClaimsSchema.safeParse(payload);
  if (!claimsResult.success) {
    return { valid: false, reason: "malformed" };
  }
  const claims = claimsResult.data;
  const now = input.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (claims.exp <= nowSeconds) {
    return { valid: false, reason: "expired" };
  }
  // The signed idleExp is a claim for observability, not the authority: the
  // database row is touched on every request and enforces the sliding window
  // below, so a fixed claim cannot cut an active session short.

  const tokenHash = await sha256Hex(input.token);
  const session = await input.prisma.operatorSession.findUnique({
    where: { tokenHash },
    include: { operator: { select: { status: true } } },
  });

  if (session === null) {
    return { valid: false, reason: "not_found" };
  }
  if (session.id !== claims.sid || session.operatorId !== claims.sub) {
    return { valid: false, reason: "malformed" };
  }
  if (session.revokedAt !== null) {
    return { valid: false, reason: "revoked" };
  }
  // T182: a session is valid only under the relying-party identity that issued
  // it. A domain move changes that identity, so the stale row is revoked here
  // rather than left usable until its absolute expiry.
  if (session.rpId !== input.rpID) {
    await revokeStaleReliance(input.prisma, session.id, now);
    return { valid: false, reason: "rp_mismatch" };
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }
  if (session.idleExpiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "idle_timeout" };
  }
  if (session.operator.status !== "ACTIVE") {
    return { valid: false, reason: "operator_inactive" };
  }

  return {
    valid: true,
    operatorId: session.operatorId,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt,
  };
}

export async function verifyAndTouchControlSession(
  input: VerifyControlSessionInput
): Promise<ControlSessionVerification> {
  const result = await verifyControlSession(input);
  if (result.valid) {
    await touchControlSession({
      prisma: input.prisma,
      sessionId: result.sessionId,
      now: input.now,
    });
  }
  return result;
}

export async function touchControlSession(
  input: TouchControlSessionInput
): Promise<boolean> {
  const now = input.now ?? new Date();
  const session = await input.prisma.operatorSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      idleExpiresAt: true,
    },
  });
  if (session === null || session.revokedAt !== null) {
    return false;
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  if (session.idleExpiresAt.getTime() <= now.getTime()) {
    return false;
  }

  const idleExpiresAt = new Date(
    Math.min(
      now.getTime() + CONTROL_SESSION_IDLE_SECONDS * 1000,
      session.expiresAt.getTime()
    )
  );
  await input.prisma.operatorSession.update({
    where: { id: session.id },
    data: { idleExpiresAt },
  });
  return true;
}

export async function revokeControlSession(
  input: RevokeControlSessionInput
): Promise<boolean> {
  const now = input.now ?? new Date();
  const result = await input.prisma.operatorSession.updateMany({
    where: { id: input.sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count > 0;
}
