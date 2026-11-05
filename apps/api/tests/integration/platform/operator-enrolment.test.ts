import { afterAll, beforeAll, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { redis } from "@suite/redis";
import { AUTH_ERROR_CODES } from "@suite/auth";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  problemDetailsSchema,
} from "@suite/core";
import {
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_SIGN_IN_FAILURE_REASONS,
} from "@suite/auth/platform";
import {
  getControlPlaneOrigin,
  getControlWebauthnRpId,
} from "../../../src/lib/platform-env.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { platformAuthRouter } from "../../../src/routes/admin/auth.js";
import { platformOperatorPasskeysRouter } from "../../../src/routes/admin/operator-passkeys.js";
import {
  PLATFORM_WEBAUTHN_RP_NAME,
  finishSignIn,
  type PlatformAuthDependencies,
} from "../../../src/services/admin/platform-auth.service.js";
import {
  createOperatorEnrolmentService,
  type OperatorEnrolmentServiceDependencies,
} from "../../../src/services/admin/operator.service.js";
import type { VerifiedRegistration } from "../../../src/services/admin/platform-webauthn.service.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  platformOperatorTestsEnabled,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const EMAIL_PREFIX = "operator-enrolment";
const suffix = Date.now().toString(36);
let platformPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let fixture: OperatorFixture;
const PUBLIC_KEY_TYPE = "public-key" as const;
const TEST_PUBLIC_KEY = "placeholder-public-key";
const ENCODED_BASE64_URL = "eA";

const registrationResponse: RegistrationResponseJSON = {
  id: "credential",
  rawId: ENCODED_BASE64_URL,
  type: PUBLIC_KEY_TYPE,
  response: { clientDataJSON: ENCODED_BASE64_URL, attestationObject: ENCODED_BASE64_URL },
  clientExtensionResults: {},
};

const authenticationResponse: AuthenticationResponseJSON = {
  id: "credential",
  rawId: ENCODED_BASE64_URL,
  type: PUBLIC_KEY_TYPE,
  response: { clientDataJSON: ENCODED_BASE64_URL, authenticatorData: ENCODED_BASE64_URL, signature: ENCODED_BASE64_URL },
  clientExtensionResults: {},
};

function authDependencies(
  verifyAuthentication?: PlatformAuthDependencies["verifyAuthentication"]
): PlatformAuthDependencies {
  return {
    prisma: platformPrisma,
    redis,
    secret: "platform-enrolment-test-secret-32-characters",
    config: {
      rpID: getControlWebauthnRpId(),
      rpName: PLATFORM_WEBAUTHN_RP_NAME,
      origin: getControlPlaneOrigin(),
    },
    ...(verifyAuthentication === undefined ? {} : { verifyAuthentication }),
  };
}

function signInViaRoute(credentialId: string): Promise<Response> {
  return Promise.resolve(
    platformAuthRouter.request("/sign-in/verify", {
      method: "POST",
      headers: {
        Origin: getControlPlaneOrigin(),
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.55",
      },
      body: JSON.stringify({
        flowId: "stale-flow",
        response: { ...authenticationResponse, id: credentialId },
      }),
    })
  );
}

function dependencies(
  verifyRegistration: OperatorEnrolmentServiceDependencies["verifyRegistration"]
): OperatorEnrolmentServiceDependencies {
  return {
    prisma: platformPrisma,
    redis,
    config: {
      rpID: getControlWebauthnRpId(),
      rpName: PLATFORM_WEBAUTHN_RP_NAME,
      origin: getControlPlaneOrigin(),
    },
    verifyRegistration,
  };
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorPasskeysRouter.onError(globalErrorHandler);
  platformAuthRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  platformPrisma = fixture.platformPrisma;
  ownerPrisma = fixture.ownerPrisma;
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("activates an invited operator once and writes both audit rows", async () => {
  const invitation = await fixture.createInvitedOperator([
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  ]);
  const verified: VerifiedRegistration = {
    operatorId: invitation.operatorId,
    tokenHash: invitation.tokenHash,
    credential: {
      id: `credential-${suffix}`,
      publicKey: TEST_PUBLIC_KEY,
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: [],
    },
  };
  const service = createOperatorEnrolmentService(
    dependencies(() => Promise.resolve(verified))
  );
  const summary = await service.finish({
    token: invitation.token,
    flowId: "enrolment-flow",
    response: registrationResponse,
    requestId: "req-operator-enrolment",
  });
  expect(summary.status).toBe("ACTIVE");
  expect(summary.mfaEnrolled).toBe(true);
  expect(summary.capabilities).toContain(
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code
  );
  const storedInvitation = await ownerPrisma.operatorInvitation.findUnique({
    where: { id: invitation.invitationId },
  });
  expect(storedInvitation?.acceptedAt).not.toBeNull();
  const passkey = await ownerPrisma.operatorPasskey.findUnique({
    where: { credentialId: `credential-${suffix}` },
  });
  expect(passkey?.operatorId).toBe(invitation.operatorId);
  expect(passkey?.rpId).toBe(getControlWebauthnRpId());

  const passkeyAudit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED,
      entityId: invitation.operatorId,
    },
  });
  expect(passkeyAudit?.recordHash).toHaveLength(64);
  expect(passkeyAudit?.after).toMatchObject({ rpID: getControlWebauthnRpId() });
  const invitationAudit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.INVITATION_ACCEPTED,
      entityId: invitation.invitationId,
    },
  });
  expect(invitationAudit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)("rejects replaying an accepted invitation", async () => {
  const invitation = await fixture.createInvitedOperator([
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  ]);
  const verified: VerifiedRegistration = {
    operatorId: invitation.operatorId,
    tokenHash: invitation.tokenHash,
    credential: {
      id: `credential-replay-${suffix}`,
      publicKey: TEST_PUBLIC_KEY,
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: [],
    },
  };
  const service = createOperatorEnrolmentService(
    dependencies(() => Promise.resolve(verified))
  );
  const input = {
    token: invitation.token,
    flowId: "enrolment-flow",
    response: registrationResponse,
    requestId: "req-operator-enrolment",
  };
  await service.finish(input);
  await expect(
    service.finish({ ...input, requestId: "req-operator-enrolment-replay" })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
  });
});

it.skipIf(!enabled)("rejects enrolment from a foreign or missing origin", async () => {
  const body = JSON.stringify({ token: "a".repeat(43) });
  const headerSets: Record<string, string>[] = [
    { "Content-Type": "application/json" },
    { "Content-Type": "application/json", Origin: "https://attacker.example" },
  ];
  const responses = await Promise.all(
    headerSets.map((headers) =>
      Promise.resolve(
        platformOperatorPasskeysRouter.request("/enrolment/options", {
          method: "POST",
          headers,
          body,
        })
      )
    )
  );
  for (const response of responses) {
    expect(response.status).toBe(403);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.CORS_ORIGIN_DENIED);
  }
});
it.skipIf(!enabled)("refuses a stale relying party through the sign-in route", async () => {
  const operator = await fixture.createOperator([]);
  const staleCredentialId = `stale-credential-${suffix}`;
  const currentCredentialId = `current-credential-${suffix}`;
  await platformPrisma.operatorPasskey.createMany({
    data: [
      {
        operatorId: operator.id,
        credentialId: staleCredentialId,
        publicKey: TEST_PUBLIC_KEY,
        counter: 0,
        rpId: "old.example.com",
      },
      {
        operatorId: operator.id,
        credentialId: currentCredentialId,
        publicKey: TEST_PUBLIC_KEY,
        counter: 0,
        rpId: getControlWebauthnRpId(),
      },
    ],
  });

  const stale = await signInViaRoute(staleCredentialId);
  expect(stale.status).toBe(401);
  const staleProblem = problemDetailsSchema.parse(await stale.json());
  expect(staleProblem.code).toBe(
    PLATFORM_ERROR_CODE.RP_MIGRATION_REQUIRED
  );
  expect(staleProblem.type).toBe("/errors/rp-migration-required");

  const current = await signInViaRoute(currentCredentialId);
  expect(current.status).toBe(401);
  const currentProblem = problemDetailsSchema.parse(await current.json());
  expect(currentProblem.code).toBe(AUTH_ERROR_CODES.AUTH_UNAUTHORIZED);

  const audit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.SIGN_IN_FAILED,
      entityId: operator.id,
      reason: PLATFORM_SIGN_IN_FAILURE_REASONS.RP_IDENTITY_CHANGED,
    },
  });
  expect(audit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)("stamps a legacy passkey after a successful ceremony", async () => {
  const operator = await fixture.createOperator([]);
  const credentialId = `legacy-credential-${suffix}`;
  await platformPrisma.operatorPasskey.create({
    data: {
      operatorId: operator.id,
      credentialId,
      publicKey: TEST_PUBLIC_KEY,
      counter: 0,
      rpId: null,
    },
  });

  const session = await finishSignIn(authDependencies(() => Promise.resolve(9)), {
    flowId: "legacy-flow",
    response: { ...authenticationResponse, id: credentialId },
    requestId: "req-legacy-rp",
    ip: null,
    userAgent: null,
  });
  expect(session.operator.id).toBe(operator.id);

  const passkey = await ownerPrisma.operatorPasskey.findUnique({
    where: { credentialId },
  });
  expect(passkey?.rpId).toBe(getControlWebauthnRpId());
  expect(passkey?.counter).toBe(9);
  expect(passkey?.lastUsedAt).not.toBeNull();

  const audit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.SIGNED_IN,
      entityId: operator.id,
    },
  });
  expect(audit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)("rejects a tenant passkey on operator sign-in", async () => {
  const credentialId = `tenant-credential-${suffix}`;
  const user = await ownerPrisma.user.create({
    data: {
      email: `tenant-passkey-${suffix}@example.com`,
      name: "Tenant Passkey User",
    },
  });
  await ownerPrisma.passkey.create({
    data: {
      userId: user.id,
      credentialID: credentialId,
      publicKey: TEST_PUBLIC_KEY,
    },
  });
  try {
    const response = await signInViaRoute(credentialId);
    expect(response.status).toBe(401);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe(AUTH_ERROR_CODES.AUTH_UNAUTHORIZED);
  } finally {
    await ownerPrisma.passkey.deleteMany({
      where: { credentialID: credentialId },
    });
    await ownerPrisma.user.delete({ where: { id: user.id } });
  }
});
