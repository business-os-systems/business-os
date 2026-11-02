import type { PlatformOperator, PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import type { PlatformCapability } from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import { AUTH_ERROR_CODES } from "@suite/auth";
import {
  appendPlatformAuditEvent,
  consumeBootstrapToken,
  hashBootstrapToken,
  issueControlSession,
  readBootstrapToken,
  resolvePlatformCapabilities,
  revokeControlSession,
  verifyAndTouchControlSession,
  PLATFORM_AUDIT_ACTIONS,
  type IssuedControlSession,
} from "@suite/auth/platform";
import {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
  type StoredCredential,
  type VerifiedRegistration,
  type WebAuthnConfig,
} from "./platform-webauthn.service.js";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

export const PLATFORM_WEBAUTHN_RP_NAME = "Business OS Platform";

export interface PlatformAuthDependencies {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly secret: string;
  readonly config: WebAuthnConfig;
}

export interface PlatformOperatorIdentity {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface PlatformSession {
  readonly session: IssuedControlSession;
  readonly operator: PlatformOperatorIdentity;
  readonly capabilities: readonly PlatformCapability[];
}

export interface AuthRequestContext {
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

function unauthorized(message = "Sign-in failed."): UnauthorizedError {
  return new UnauthorizedError(message, { code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED });
}

function bootstrapLinkInvalid(): UnauthorizedError {
  return unauthorized("The bootstrap link is invalid or expired.");
}

async function audit(
  deps: PlatformAuthDependencies,
  input: {
    readonly action: string;
    readonly actorOperatorId: string | null;
    readonly entityId: string;
    readonly requestId: string;
    readonly reason?: string | null;
  }
): Promise<void> {
  await appendPlatformAuditEvent(deps.prisma, {
    actorOperatorId: input.actorOperatorId,
    action: input.action,
    entityType: "PlatformOperator",
    entityId: input.entityId,
    reason: input.reason ?? null,
    requestId: input.requestId,
  });
}

interface IssueSessionInput {
  readonly deps: PlatformAuthDependencies;
  readonly operator: { id: string; email: string; displayName: string };
  readonly context: AuthRequestContext;
  readonly passkeyUpdate?: {
    readonly id: string;
    readonly counter: number;
  };
}

async function issueSession(input: IssueSessionInput): Promise<PlatformSession> {
  const { deps, operator, context } = input;
  let session: IssuedControlSession | undefined;
  await deps.prisma.$transaction(async (tx) => {
    session = await issueControlSession({
      prisma: tx,
      secret: deps.secret,
      operatorId: operator.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    if (input.passkeyUpdate) {
      await tx.operatorPasskey.update({
        where: { id: input.passkeyUpdate.id },
        data: {
          counter: input.passkeyUpdate.counter,
          lastUsedAt: new Date(),
        },
      });
    }
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: operator.id,
      action: PLATFORM_AUDIT_ACTIONS.SIGNED_IN,
      entityType: "PlatformOperator",
      entityId: operator.id,
      requestId: context.requestId,
    });
  });
  if (session === undefined) {
    throw unauthorized("Authentication required.");
  }
  const capabilities = await resolvePlatformCapabilities({
    prisma: deps.prisma,
    redis: deps.redis,
    operatorId: operator.id,
  });
  return {
    session,
    operator: {
      id: operator.id,
      email: operator.email,
      displayName: operator.displayName,
    },
    capabilities,
  };
}

export async function startBootstrap(
  deps: PlatformAuthDependencies,
  token: string
): Promise<{
  flowId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  email: string;
}> {
  const payload = await readBootstrapToken(deps.redis, token);
  if (payload === null) {
    throw bootstrapLinkInvalid();
  }
  const operator = await deps.prisma.platformOperator.findUnique({
    where: { id: payload.operatorId },
  });
  if (
    operator === null ||
    operator.status !== "INVITED" ||
    operator.mfaEnrolled
  ) {
    throw bootstrapLinkInvalid();
  }
  const tokenHash = await hashBootstrapToken(token);
  const registration = await startRegistration({
    redis: deps.redis,
    config: deps.config,
    operator,
    tokenHash,
  });
  return { ...registration, email: operator.email };
}

export interface FinishBootstrapInput {
  readonly token: string;
  readonly flowId: string;
  readonly response: RegistrationResponseJSON;
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

async function verifyBootstrapRegistration(
  deps: PlatformAuthDependencies,
  input: FinishBootstrapInput
): Promise<VerifiedRegistration> {
  try {
    return await finishRegistration({
      redis: deps.redis,
      config: deps.config,
      flowId: input.flowId,
      response: input.response,
    });
  } catch {
    throw unauthorized("Passkey registration failed.");
  }
}

interface ClaimBootstrapOperatorInput {
  readonly deps: PlatformAuthDependencies;
  readonly input: FinishBootstrapInput;
  readonly verified: VerifiedRegistration;
}

async function claimBootstrapOperator(
  input: ClaimBootstrapOperatorInput
): Promise<PlatformOperator> {
  const { deps, verified } = input;
  const tokenHash = await hashBootstrapToken(input.input.token);
  if (tokenHash !== verified.tokenHash) {
    throw bootstrapLinkInvalid();
  }
  // Consume before any write so concurrent verifies cannot register two passkeys.
  const payload = await consumeBootstrapToken(deps.redis, input.input.token);
  if (payload === null || payload.operatorId !== verified.operatorId) {
    throw bootstrapLinkInvalid();
  }
  const operator = await deps.prisma.platformOperator.findUnique({
    where: { id: payload.operatorId },
  });
  if (operator === null || operator.status !== "INVITED") {
    throw bootstrapLinkInvalid();
  }
  return operator;
}

interface StoreBootstrapPasskeyInput {
  readonly deps: PlatformAuthDependencies;
  readonly operator: PlatformOperator;
  readonly verified: VerifiedRegistration;
  readonly requestId: string;
}

async function storeBootstrapPasskey(
  input: StoreBootstrapPasskeyInput
): Promise<void> {
  const { deps, operator, verified, requestId } = input;
  await deps.prisma.$transaction(async (tx) => {
    await tx.operatorPasskey.create({
      data: {
        operatorId: operator.id,
        credentialId: verified.credential.id,
        publicKey: verified.credential.publicKey,
        counter: verified.credential.counter,
        deviceType: verified.credential.deviceType,
        backedUp: verified.credential.backedUp,
        transports: verified.credential.transports.join(","),
        name: "Primary passkey",
      },
    });
    await tx.platformOperator.update({
      where: { id: operator.id },
      data: {
        status: "ACTIVE",
        mfaEnrolled: true,
        lastSeenAt: new Date(),
      },
    });
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: operator.id,
      action: PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED,
      entityType: "PlatformOperator",
      entityId: operator.id,
      requestId,
    });
  });
}

export async function finishBootstrap(
  deps: PlatformAuthDependencies,
  input: FinishBootstrapInput
): Promise<PlatformSession> {
  const verified = await verifyBootstrapRegistration(deps, input);
  const operator = await claimBootstrapOperator({ deps, input, verified });
  await storeBootstrapPasskey({
    deps,
    operator,
    verified,
    requestId: input.requestId,
  });
  return issueSession({
    deps,
    operator,
    context: {
      requestId: input.requestId,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

export async function startSignIn(
  deps: PlatformAuthDependencies
): Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const operatorCount = await deps.prisma.platformOperator.count();
  if (operatorCount === 0) {
    throw unauthorized("Sign-in is not available.");
  }
  return startAuthentication(deps.redis, deps.config);
}

export interface FinishSignInInput {
  readonly flowId: string;
  readonly response: AuthenticationResponseJSON;
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

interface SignInPasskey {
  readonly id: string;
  readonly operatorId: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: string | null;
  readonly operator: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly status: string;
    readonly mfaEnrolled: boolean;
  };
}

interface FailSignInInput {
  readonly deps: PlatformAuthDependencies;
  readonly input: FinishSignInInput;
  readonly actorOperatorId: string | null;
  readonly reason: string;
}

async function failSignIn(input: FailSignInInput): Promise<never> {
  const { deps, actorOperatorId, reason } = input;
  await audit(deps, {
    action: PLATFORM_AUDIT_ACTIONS.SIGN_IN_FAILED,
    actorOperatorId,
    entityId: actorOperatorId ?? "unknown",
    requestId: input.input.requestId,
    reason,
  });
  throw unauthorized("Sign-in failed.");
}

async function loadSignInPasskey(
  deps: PlatformAuthDependencies,
  input: FinishSignInInput
): Promise<SignInPasskey> {
  const passkey = await deps.prisma.operatorPasskey.findUnique({
    where: { credentialId: input.response.id },
    include: { operator: true },
  });
  if (passkey === null) {
    return failSignIn({ deps, input, actorOperatorId: null, reason: "UNKNOWN_CREDENTIAL" });
  }
  if (passkey.operator.status !== "ACTIVE" || !passkey.operator.mfaEnrolled) {
    return failSignIn({ deps, input, actorOperatorId: passkey.operatorId, reason: "OPERATOR_INACTIVE" });
  }
  return passkey;
}

interface VerifySignInPasskeyInput {
  readonly deps: PlatformAuthDependencies;
  readonly input: FinishSignInInput;
  readonly passkey: SignInPasskey;
}

async function verifySignInPasskey(
  options: VerifySignInPasskeyInput
): Promise<number> {
  const { deps, input, passkey } = options;
  const credential: StoredCredential = {
    id: passkey.credentialId,
    publicKey: passkey.publicKey,
    counter: passkey.counter,
    transports: passkey.transports
      ? passkey.transports.split(",").filter(Boolean)
      : [],
  };
  try {
    return await finishAuthentication({
      redis: deps.redis,
      config: deps.config,
      flowId: input.flowId,
      response: input.response,
      credential,
    });
  } catch {
    return failSignIn({ deps, input, actorOperatorId: passkey.operatorId, reason: "VERIFICATION_FAILED" });
  }
}

export async function finishSignIn(
  deps: PlatformAuthDependencies,
  input: FinishSignInInput
): Promise<PlatformSession> {
  const passkey = await loadSignInPasskey(deps, input);
  const newCounter = await verifySignInPasskey({ deps, input, passkey });
  return issueSession({
    deps,
    operator: passkey.operator,
    passkeyUpdate: { id: passkey.id, counter: newCounter },
    context: {
      requestId: input.requestId,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

export async function getSession(
  deps: PlatformAuthDependencies,
  token: string
): Promise<{
  operator: PlatformOperatorIdentity;
  capabilities: readonly PlatformCapability[];
}> {
  const verified = await verifyAndTouchControlSession({
    prisma: deps.prisma,
    secret: deps.secret,
    token,
  });
  if (!verified.valid) {
    throw unauthorized("Authentication required.");
  }
  const operator = await deps.prisma.platformOperator.findUnique({
    where: { id: verified.operatorId },
  });
  if (operator === null) {
    throw unauthorized("Authentication required.");
  }
  const capabilities = await resolvePlatformCapabilities({
    prisma: deps.prisma,
    redis: deps.redis,
    operatorId: operator.id,
  });
  return {
    operator: {
      id: operator.id,
      email: operator.email,
      displayName: operator.displayName,
    },
    capabilities,
  };
}

export async function logout(
  deps: PlatformAuthDependencies,
  input: { token: string | null; requestId: string }
): Promise<void> {
  if (input.token === null) {
    return;
  }
  const verified = await verifyAndTouchControlSession({
    prisma: deps.prisma,
    secret: deps.secret,
    token: input.token,
  });
  if (!verified.valid) {
    return;
  }
  await revokeControlSession({
    prisma: deps.prisma,
    sessionId: verified.sessionId,
  });
  await audit(deps, {
    action: PLATFORM_AUDIT_ACTIONS.SIGNED_OUT,
    actorOperatorId: verified.operatorId,
    entityId: verified.operatorId,
    requestId: input.requestId,
  });
}
