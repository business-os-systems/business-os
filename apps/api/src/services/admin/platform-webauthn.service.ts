import { randomUUID } from "node:crypto";
import type { Redis } from "@suite/redis";
import { UnauthorizedError } from "@suite/core/errors";
import { AUTH_ERROR_CODES } from "@suite/auth";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";

export const WEBAUTHN_CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_PREFIX = "platform:webauthn:";

export interface WebAuthnConfig {
  readonly rpID: string;
  readonly rpName: string;
  readonly origin: string;
}

interface RegistrationChallenge {
  readonly kind: "registration";
  readonly challenge: string;
  readonly operatorId: string;
  readonly tokenHash: string;
}

interface AuthenticationChallenge {
  readonly kind: "authentication";
  readonly challenge: string;
}

type ChallengeRecord = RegistrationChallenge | AuthenticationChallenge;

function challengeKey(flowId: string): string {
  return `${CHALLENGE_PREFIX}${flowId}`;
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export interface StartRegistrationInput {
  readonly redis: Redis;
  readonly config: WebAuthnConfig;
  readonly operator: { id: string; email: string; displayName: string };
  readonly tokenHash: string;
}

export async function startRegistration(
  input: StartRegistrationInput
): Promise<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const { redis, config, operator, tokenHash } = input;
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: new TextEncoder().encode(operator.id),
    userName: operator.email,
    userDisplayName: operator.displayName,
    attestationType: "none",
    // residentKey + user verification satisfy #218. FR-057's stricter
    // "device-bound" reading would reject synced passkeys (credentialBackedUp);
    // that policy needs a product decision because an operator whose only
    // passkey is synced would otherwise be locked out.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  const flowId = randomUUID();
  const record: RegistrationChallenge = {
    kind: "registration",
    challenge: options.challenge,
    operatorId: operator.id,
    tokenHash,
  };
  await redis.set(
    challengeKey(flowId),
    JSON.stringify(record),
    "EX",
    WEBAUTHN_CHALLENGE_TTL_SECONDS
  );
  return { flowId, options };
}

interface ConsumeChallengeInput {
  readonly redis: Redis;
  readonly flowId: string;
  readonly kind: "registration" | "authentication";
}

interface ParseChallengeInput {
  readonly raw: string;
  readonly kind: "registration" | "authentication";
}

interface ChallengeEnvelope {
  readonly kind: "registration" | "authentication";
  readonly challenge: string;
  readonly operatorId?: string;
  readonly tokenHash?: string;
}

function parseChallengeEnvelope(
  raw: string,
  kind: "registration" | "authentication"
): ChallengeEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UnauthorizedError("The passkey challenge is malformed", {
      code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED,
    });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("kind" in parsed) ||
    parsed.kind !== kind ||
    !("challenge" in parsed) ||
    typeof parsed.challenge !== "string"
  ) {
    throw new UnauthorizedError("The passkey challenge is malformed", {
      code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED,
    });
  }
  return parsed as ChallengeEnvelope;
}

function parseRegistrationChallenge(
  envelope: ChallengeEnvelope
): ChallengeRecord {
  if (
    typeof envelope.operatorId !== "string" ||
    typeof envelope.tokenHash !== "string"
  ) {
    throw new UnauthorizedError("The registration challenge is malformed", {
      code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED,
    });
  }
  return {
    kind: "registration",
    challenge: envelope.challenge,
    operatorId: envelope.operatorId,
    tokenHash: envelope.tokenHash,
  };
}

function parseChallenge(input: ParseChallengeInput): ChallengeRecord {
  const envelope = parseChallengeEnvelope(input.raw, input.kind);
  if (input.kind === "registration") {
    return parseRegistrationChallenge(envelope);
  }
  return { kind: "authentication", challenge: envelope.challenge };
}

async function consumeChallenge(
  input: ConsumeChallengeInput
): Promise<ChallengeRecord> {
  const raw = await input.redis.getdel(challengeKey(input.flowId));
  if (raw === null) {
    throw new UnauthorizedError(
      "The passkey challenge expired or was already used",
      { code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED }
    );
  }
  return parseChallenge({ raw, kind: input.kind });
}

export interface VerifiedRegistration {
  readonly operatorId: string;
  readonly tokenHash: string;
  readonly credential: {
    readonly id: string;
    readonly publicKey: string;
    readonly counter: number;
    readonly deviceType: string;
    readonly backedUp: boolean;
    readonly transports: string[];
  };
}

export interface FinishRegistrationInput {
  readonly redis: Redis;
  readonly config: WebAuthnConfig;
  readonly flowId: string;
  readonly response: RegistrationResponseJSON;
}

export async function finishRegistration(
  input: FinishRegistrationInput
): Promise<VerifiedRegistration> {
  const challenge = await consumeChallenge({
    redis: input.redis,
    flowId: input.flowId,
    kind: "registration",
  });
  if (challenge.kind !== "registration") {
    throw new UnauthorizedError("The registration challenge is malformed", { code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED });
  }
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: input.config.origin,
    expectedRPID: input.config.rpID,
    requireUserVerification: true,
  });
  if (!verification.verified) {
    throw new UnauthorizedError("Passkey registration could not be verified", { code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED });
  }
  const credential = verification.registrationInfo.credential;
  return {
    operatorId: challenge.operatorId,
    tokenHash: challenge.tokenHash,
    credential: {
      id: credential.id,
      publicKey: encodeBase64Url(credential.publicKey),
      counter: credential.counter,
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      transports: credential.transports ?? [],
    },
  };
}

export async function startAuthentication(
  redis: Redis,
  config: WebAuthnConfig
): Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: [],
    userVerification: "required",
  });
  const flowId = randomUUID();
  const record: AuthenticationChallenge = {
    kind: "authentication",
    challenge: options.challenge,
  };
  await redis.set(
    challengeKey(flowId),
    JSON.stringify(record),
    "EX",
    WEBAUTHN_CHALLENGE_TTL_SECONDS
  );
  return { flowId, options };
}

export interface StoredCredential {
  readonly id: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: string[];
}

export interface FinishAuthenticationInput {
  readonly redis: Redis;
  readonly config: WebAuthnConfig;
  readonly flowId: string;
  readonly response: AuthenticationResponseJSON;
  readonly credential: StoredCredential;
}

export async function finishAuthentication(
  input: FinishAuthenticationInput
): Promise<number> {
  const challenge = await consumeChallenge({
    redis: input.redis,
    flowId: input.flowId,
    kind: "authentication",
  });
  if (challenge.kind !== "authentication") {
    throw new UnauthorizedError("The authentication challenge is malformed", { code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED });
  }
  const credential: WebAuthnCredential = {
    id: input.credential.id,
    publicKey: new Uint8Array(Buffer.from(input.credential.publicKey, "base64url")),
    counter: input.credential.counter,
    transports: input.credential.transports as WebAuthnCredential["transports"],
  };
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: input.config.origin,
    expectedRPID: input.config.rpID,
    credential,
    requireUserVerification: true,
  });
  if (!verification.verified) {
    throw new UnauthorizedError("Passkey sign-in could not be verified", { code: AUTH_ERROR_CODES.AUTH_UNAUTHORIZED });
  }
  return verification.authenticationInfo.newCounter;
}
