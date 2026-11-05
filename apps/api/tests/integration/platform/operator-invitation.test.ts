import { afterAll, beforeAll, expect, it } from "vitest";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { redis } from "@suite/redis";
import { PLATFORM_ERROR_CODE, PLATFORM_CAPABILITIES } from "@suite/core";
import { PLATFORM_WEBAUTHN_RP_NAME } from "../../../src/services/admin/platform-auth.service.js";
import {
  createOperatorEnrolmentService,
  type OperatorEnrolmentServiceDependencies,
} from "../../../src/services/admin/operator.service.js";
import type { VerifiedRegistration } from "../../../src/services/admin/platform-webauthn.service.js";
import {
  getControlPlaneOrigin,
  getControlWebauthnRpId,
} from "../../../src/lib/platform-env.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  type InvitationFixture,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";
import { platformIntegrationTestsEnabled } from "../../helpers/platform-db.js";

loadPlatformTestEnv();

const enabled = platformIntegrationTestsEnabled();
const INVITATION_FLOW_ID = "invitation-flow";

const registrationResponse: RegistrationResponseJSON = {
  id: "credential",
  rawId: "eA",
  type: "public-key",
  response: { clientDataJSON: "eA", attestationObject: "eA" },
  clientExtensionResults: {},
};

let fixture: OperatorFixture;

function verifiedFor(
  invitation: InvitationFixture,
  overrides: Partial<VerifiedRegistration> = {}
): VerifiedRegistration {
  return {
    operatorId: invitation.operatorId,
    tokenHash: invitation.tokenHash,
    credential: {
      id: `credential-${invitation.invitationId}`,
      publicKey: "public-key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: [],
    },
    ...overrides,
  };
}

function service(verified: VerifiedRegistration) {
  const dependencies: OperatorEnrolmentServiceDependencies = {
    prisma: fixture.platformPrisma,
    redis,
    config: {
      rpID: getControlWebauthnRpId(),
      rpName: PLATFORM_WEBAUTHN_RP_NAME,
      origin: getControlPlaneOrigin(),
    },
    verifyRegistration: () => Promise.resolve(verified),
  };
  return createOperatorEnrolmentService(dependencies);
}

beforeAll(async () => {
  if (!enabled) return;
  fixture = await createOperatorFixture("operator-invitation");
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("accepts an invitation exactly once", async () => {
  const invitation = await fixture.createInvitedOperator([
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  ]);
  const first = await service(verifiedFor(invitation)).finish({
    token: invitation.token,
    flowId: INVITATION_FLOW_ID,
    response: registrationResponse,
    requestId: "req-invitation-first",
  });
  expect(first.status).toBe("ACTIVE");

  await expect(
    service(verifiedFor(invitation)).finish({
      token: invitation.token,
      flowId: INVITATION_FLOW_ID,
      response: registrationResponse,
      requestId: "req-invitation-replay",
    })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
  });

  const passkeys = await fixture.ownerPrisma.operatorPasskey.count({
    where: { operatorId: invitation.operatorId },
  });
  expect(passkeys).toBe(1);
});

type ClaimOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

function isFailedClaim(outcome: ClaimOutcome): outcome is Extract<
  ClaimOutcome,
  { readonly ok: false }
> {
  return outcome.ok === false;
}

it.skipIf(!enabled)("accepts only one of two concurrent claims", async () => {
  const invitation = await fixture.createInvitedOperator();
  const attempt = async (requestId: string): Promise<ClaimOutcome> => {
    try {
      await service(verifiedFor(invitation)).finish({
        token: invitation.token,
        flowId: INVITATION_FLOW_ID,
        response: registrationResponse,
        requestId,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const outcomes = await Promise.all([
    attempt("req-concurrent-claim-a"),
    attempt("req-concurrent-claim-b"),
  ]);
  expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
  const failures = outcomes.filter(isFailedClaim);
  expect(failures).toHaveLength(1);
  expect(failures[0]?.error).toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
  });

  const passkeys = await fixture.ownerPrisma.operatorPasskey.count({
    where: { operatorId: invitation.operatorId },
  });
  expect(passkeys).toBe(1);
});

it.skipIf(!enabled)("rejects an invitation that expired before verification", async () => {
  const invitation = await fixture.createInvitedOperator();
  await fixture.ownerPrisma.operatorInvitation.update({
    where: { id: invitation.invitationId },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });

  await expect(
    service(verifiedFor(invitation)).finish({
      token: invitation.token,
      flowId: INVITATION_FLOW_ID,
      response: registrationResponse,
      requestId: "req-invitation-expired",
    })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
  });

  const operator = await fixture.ownerPrisma.platformOperator.findUniqueOrThrow({
    where: { id: invitation.operatorId },
  });
  expect(operator.status).toBe("INVITED");
  expect(operator.mfaEnrolled).toBe(false);
  const passkeys = await fixture.ownerPrisma.operatorPasskey.count({
    where: { operatorId: invitation.operatorId },
  });
  expect(passkeys).toBe(0);
});

it.skipIf(!enabled)("rejects a token bound to another address", async () => {
  const invitation = await fixture.createInvitedOperator();
  const other = await fixture.createInvitedOperator();
  await expect(
    service(verifiedFor(invitation, { operatorId: other.operatorId })).finish({
      token: invitation.token,
      flowId: INVITATION_FLOW_ID,
      response: registrationResponse,
      requestId: "req-invitation-mismatch",
    })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
  });
  const passkeys = await fixture.ownerPrisma.operatorPasskey.count({
    where: { operatorId: { in: [invitation.operatorId, other.operatorId] } },
  });
  expect(passkeys).toBe(0);
});

it.skipIf(!enabled)("rejects a revoked invitation", async () => {
  const invitation = await fixture.createInvitedOperator();
  await fixture.ownerPrisma.operatorInvitation.update({
    where: { id: invitation.invitationId },
    data: { revokedAt: new Date() },
  });

  await expect(
    service(verifiedFor(invitation)).finish({
      token: invitation.token,
      flowId: INVITATION_FLOW_ID,
      response: registrationResponse,
      requestId: "req-invitation-revoked",
    })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_INVITATION_INVALID,
  });
});
