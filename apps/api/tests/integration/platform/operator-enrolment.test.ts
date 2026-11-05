import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { redis } from "@suite/redis";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  problemDetailsSchema,
} from "@suite/core";
import {
  PLATFORM_AUDIT_ACTIONS,
  hashOperatorInvitationToken,
} from "@suite/auth/platform";
import {
  getControlPlaneOrigin,
  getControlWebauthnRpId,
} from "../../../src/lib/platform-env.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { platformOperatorPasskeysRouter } from "../../../src/routes/admin/operator-passkeys.js";
import { PLATFORM_WEBAUTHN_RP_NAME } from "../../../src/services/admin/platform-auth.service.js";
import {
  createOperatorEnrolmentService,
  type OperatorEnrolmentServiceDependencies,
} from "../../../src/services/admin/operator.service.js";
import type { VerifiedRegistration } from "../../../src/services/admin/platform-webauthn.service.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  disconnectPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

const enabled = platformIntegrationTestsEnabled();
const EMAIL_PREFIX = "operator-enrolment";
const suffix = Date.now().toString(36);
const createdOperatorIds: string[] = [];
const createdInvitationIds: string[] = [];
let platformPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let inviterId: string;
let invitationCounter = 0;

const registrationResponse: RegistrationResponseJSON = {
  id: "credential",
  rawId: "eA",
  type: "public-key",
  response: { clientDataJSON: "eA", attestationObject: "eA" },
  clientExtensionResults: {},
};

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

async function createInvitation(): Promise<{
  operatorId: string;
  invitationId: string;
  token: string;
  tokenHash: string;
}> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashOperatorInvitationToken(token);
  const email = `${EMAIL_PREFIX}-${suffix}-${invitationCounter++}@example.com`;
  const operator = await platformPrisma.platformOperator.create({
    data: {
      email,
      displayName: "Invited Enrolment Operator",
      status: "INVITED",
      mfaEnrolled: false,
      invitedBy: inviterId,
    },
  });
  createdOperatorIds.push(operator.id);
  await platformPrisma.operatorCapability.create({
    data: {
      operatorId: operator.id,
      capability: PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
      grantedBy: inviterId,
    },
  });
  const invitation = await platformPrisma.operatorInvitation.create({
    data: {
      email,
      tokenHash,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  createdInvitationIds.push(invitation.id);
  return { operatorId: operator.id, invitationId: invitation.id, token, tokenHash };
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorPasskeysRouter.onError(globalErrorHandler);
  platformPrisma = createPlatformTestClient();
  ownerPrisma = createPlatformOwnerTestClient();
  const inviter = await platformPrisma.platformOperator.create({
    data: {
      email: `${EMAIL_PREFIX}-inviter-${suffix}@example.com`,
      displayName: "Enrolment Inviter",
      status: "ACTIVE",
      mfaEnrolled: true,
    },
  });
  inviterId = inviter.id;
  createdOperatorIds.push(inviter.id);
});

afterAll(async () => {
  if (!enabled) return;
  await ownerPrisma.auditEvent.deleteMany({
    where: {
      OR: [
        { entityId: { in: [...createdOperatorIds, ...createdInvitationIds] } },
        { actorOperatorId: { in: createdOperatorIds } },
      ],
    },
  });
  await ownerPrisma.operatorPasskey.deleteMany({
    where: { operatorId: { in: createdOperatorIds } },
  });
  await ownerPrisma.operatorSession.deleteMany({
    where: { operatorId: { in: createdOperatorIds } },
  });
  await ownerPrisma.operatorCapability.deleteMany({
    where: { operatorId: { in: createdOperatorIds } },
  });
  await ownerPrisma.operatorInvitation.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
  await ownerPrisma.platformOperator.deleteMany({
    where: { id: { in: createdOperatorIds } },
  });
  await disconnectPlatformTestClient(platformPrisma);
  await disconnectPlatformTestClient(ownerPrisma);
});

it.skipIf(!enabled)("activates an invited operator once and writes both audit rows", async () => {
  const invitation = await createInvitation();
  const verified: VerifiedRegistration = {
    operatorId: invitation.operatorId,
    tokenHash: invitation.tokenHash,
    credential: {
      id: `credential-${suffix}`,
      publicKey: "public-key",
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

  const passkeyAudit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED,
      entityId: invitation.operatorId,
    },
  });
  expect(passkeyAudit?.recordHash).toHaveLength(64);
  const invitationAudit = await ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.INVITATION_ACCEPTED,
      entityId: invitation.invitationId,
    },
  });
  expect(invitationAudit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)("rejects replaying an accepted invitation", async () => {
  const invitation = await createInvitation();
  const verified: VerifiedRegistration = {
    operatorId: invitation.operatorId,
    tokenHash: invitation.tokenHash,
    credential: {
      id: `credential-replay-${suffix}`,
      publicKey: "public-key",
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
