import type { PlatformOperator, PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import {
  PLATFORM_ERROR_CODE,
  getPlatformErrorDefinition,
  type PlatformCapability,
  type PlatformErrorCode,
} from "@suite/core";
import { UnauthorizedError } from "@suite/core/errors";
import { AUTH_ERROR_CODES } from "@suite/auth";
import {
  appendPlatformAuditEvent,
  assessRelyingPartyBinding,
  consumeBootstrapToken,
  hashBootstrapToken,
  issueControlSession,
  issueStepUpToken,
  readBootstrapToken,
  resolvePlatformCapabilities,
  revokeControlSession,
  verifyAndTouchControlSession,
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_SIGN_IN_FAILURE_REASONS,
  PLATFORM_STEP_UP_FAILURE_REASONS,
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
  /** Test seam; the factory defaults it to the shared WebAuthn verifier. */
  readonly verifyAuthentication?: typeof finishAuthentication;
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
    readonly after?: Record<string, string>;
  }
): Promise<void> {
  await appendPlatformAuditEvent(deps.prisma, {
    actorOperatorId: input.actorOperatorId,
    action: input.action,
    entityType: "PlatformOperator",
    entityId: input.entityId,
    ...(input.after === undefined ? {} : { after: input.after }),
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
    readonly rpId: string;
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
          rpId: input.passkeyUpdate.rpId,
          lastUsedAt: new Date(),
        },
      });
    }
    await tx.platformOperator.update({
      where: { id: operator.id },
      data: { lastSeenAt: new Date() },
    });
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
        rpId: deps.config.rpID,
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
      after: { rpID: deps.config.rpID },
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
  readonly rpId: string | null;
  readonly operator: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly status: string;
    readonly mfaEnrolled: boolean;
  };
}

interface SignInFailure {
  readonly code: PlatformErrorCode;
  readonly detail: string;
}

interface FailSignInInput {
  readonly deps: PlatformAuthDependencies;
  readonly input: FinishSignInInput;
  readonly actorOperatorId: string | null;
  readonly reason: string;
  readonly failure?: SignInFailure;
  readonly after?: Record<string, string>;
}

async function failSignIn(input: FailSignInInput): Promise<never> {
  const { deps, actorOperatorId, reason, failure, after } = input;
  await audit(deps, {
    action: PLATFORM_AUDIT_ACTIONS.SIGN_IN_FAILED,
    actorOperatorId,
    entityId: actorOperatorId ?? "unknown",
    requestId: input.input.requestId,
    reason,
    ...(after === undefined ? {} : { after }),
  });
  if (failure === undefined) {
    throw unauthorized("Sign-in failed.");
  }
  const definition = getPlatformErrorDefinition(failure.code);
  throw new UnauthorizedError(failure.detail, {
    code: failure.code,
    title: definition.title,
  });
}

interface AuthenticationRefusal {
  readonly actorOperatorId: string | null;
  readonly reason: string;
  readonly failure?: SignInFailure;
  readonly after?: Record<string, string>;
}

type RefuseAuthentication = (refusal: AuthenticationRefusal) => Promise<never>;

interface LoadPasskeyInput {
  readonly deps: PlatformAuthDependencies;
  readonly credentialId: string;
}

async function loadAuthenticationPasskey(
  options: LoadPasskeyInput,
  refuse: RefuseAuthentication
): Promise<SignInPasskey> {
  const { deps, credentialId } = options;
  const passkey = await deps.prisma.operatorPasskey.findUnique({
    where: { credentialId },
    include: { operator: true },
  });
  if (passkey === null) {
    return refuse({ actorOperatorId: null, reason: PLATFORM_SIGN_IN_FAILURE_REASONS.UNKNOWN_CREDENTIAL });
  }
  if (passkey.operator.status !== "ACTIVE" || !passkey.operator.mfaEnrolled) {
    return refuse({ actorOperatorId: passkey.operatorId, reason: PLATFORM_SIGN_IN_FAILURE_REASONS.OPERATOR_INACTIVE });
  }
  const binding = assessRelyingPartyBinding({
    currentRpID: deps.config.rpID,
    enrolledRpID: passkey.rpId,
  });
  // A stale credential cannot pass the current-RP ceremony, so this branch is
  // the only place to tell the operator to re-enrol. Credential IDs are not
  // secrets, the route is Origin-guarded and rate-limited, and no domain or
  // operator data is returned; the residual staleness disclosure is accepted
  // (security review SCR-001).
  if (binding.state === "re_enrolment_required") {
    return refuse({
      actorOperatorId: passkey.operatorId,
      reason: PLATFORM_SIGN_IN_FAILURE_REASONS.RP_IDENTITY_CHANGED,
      failure: {
        code: PLATFORM_ERROR_CODE.RP_MIGRATION_REQUIRED,
        detail: "This passkey must be re-enrolled before it can be used.",
      },
      after: {
        enrolledRpID: binding.enrolledRpID,
        currentRpID: binding.currentRpID,
      },
    });
  }
  return passkey;
}

interface VerifyAssertionInput {
  readonly deps: PlatformAuthDependencies;
  readonly flowId: string;
  readonly response: AuthenticationResponseJSON;
  readonly passkey: SignInPasskey;
}

async function verifyAuthenticationAssertion(
  options: VerifyAssertionInput,
  refuse: RefuseAuthentication
): Promise<number> {
  const { deps, flowId, response, passkey } = options;
  const credential: StoredCredential = {
    id: passkey.credentialId,
    publicKey: passkey.publicKey,
    counter: passkey.counter,
    transports: passkey.transports
      ? passkey.transports.split(",").filter(Boolean)
      : [],
  };
  try {
    const verify = deps.verifyAuthentication ?? finishAuthentication;
    return await verify({
      redis: deps.redis,
      config: deps.config,
      flowId,
      response,
      credential,
    });
  } catch {
    return refuse({
      actorOperatorId: passkey.operatorId,
      reason: PLATFORM_SIGN_IN_FAILURE_REASONS.VERIFICATION_FAILED,
    });
  }
}

export async function finishSignIn(
  deps: PlatformAuthDependencies,
  input: FinishSignInInput
): Promise<PlatformSession> {
  const refuse: RefuseAuthentication = (refusal) =>
    failSignIn({ deps, input, ...refusal });
  const passkey = await loadAuthenticationPasskey(
    { deps, credentialId: input.response.id },
    refuse
  );
  const newCounter = await verifyAuthenticationAssertion(
    { deps, flowId: input.flowId, response: input.response, passkey },
    refuse
  );
  return issueSession({
    deps,
    operator: passkey.operator,
    passkeyUpdate: {
      id: passkey.id,
      counter: newCounter,
      rpId: deps.config.rpID,
    },
    context: {
      requestId: input.requestId,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

interface FailStepUpInput extends AuthenticationRefusal {
  readonly deps: PlatformAuthDependencies;
  readonly operatorId: string;
  readonly requestId: string;
}

async function failStepUp(input: FailStepUpInput): Promise<never> {
  await audit(input.deps, {
    action: PLATFORM_AUDIT_ACTIONS.STEP_UP_FAILED,
    actorOperatorId: input.operatorId,
    entityId: input.operatorId,
    requestId: input.requestId,
    reason: input.reason,
    ...(input.after === undefined ? {} : { after: input.after }),
  });
  throw unauthorized("Step-up confirmation failed.");
}

export interface FinishStepUpInput {
  readonly sessionToken: string;
  readonly flowId: string;
  readonly response: AuthenticationResponseJSON;
  readonly requestId: string;
}

export interface IssuedStepUpConfirmation {
  readonly token: string;
  readonly expiresAt: string;
}

/**
 * Confirms the signed-in operator with a fresh passkey assertion, then issues
 * one single-use token (FR-046). The assertion must resolve to a passkey owned
 * by that operator, so a valid assertion for another operator is refused. The
 * passkey counter update and OPERATOR_STEP_UP_VERIFIED share one transaction;
 * every refusal writes OPERATOR_STEP_UP_FAILED and returns 401.
 */
export async function finishStepUp(
  deps: PlatformAuthDependencies,
  input: FinishStepUpInput
): Promise<IssuedStepUpConfirmation> {
  const session = await getSession(deps, input.sessionToken);
  const operatorId = session.operator.id;
  const refuse: RefuseAuthentication = (refusal) =>
    failStepUp({ deps, operatorId, requestId: input.requestId, ...refusal });
  const passkey = await loadAuthenticationPasskey(
    { deps, credentialId: input.response.id },
    refuse
  );
  if (passkey.operatorId !== operatorId) {
    return refuse({
      actorOperatorId: operatorId,
      reason: PLATFORM_STEP_UP_FAILURE_REASONS.OPERATOR_MISMATCH,
    });
  }
  const newCounter = await verifyAuthenticationAssertion(
    { deps, flowId: input.flowId, response: input.response, passkey },
    refuse
  );
  await deps.prisma.$transaction(async (tx) => {
    await tx.operatorPasskey.update({
      where: { id: passkey.id },
      data: {
        counter: newCounter,
        rpId: deps.config.rpID,
        lastUsedAt: new Date(),
      },
    });
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: operatorId,
      action: PLATFORM_AUDIT_ACTIONS.STEP_UP_VERIFIED,
      entityType: "PlatformOperator",
      entityId: operatorId,
      requestId: input.requestId,
    });
  });
  const issued = await issueStepUpToken({
    operatorId,
    secret: deps.secret,
    redis: deps.redis,
  });
  return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
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
