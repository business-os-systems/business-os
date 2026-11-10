import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { redis } from "@suite/redis";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import {
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_ENROLMENT_REVOCATION_REASONS,
  hashEnrolmentToken,
  issueControlSession,
  readEnrolmentToken,
} from "@suite/auth/platform";
import {
  getControlPlaneOrigin,
  getControlWebauthnRpId,
} from "../../../src/lib/platform-env.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import {
  OPERATOR_PASSKEYS_RATE_LIMIT_KEY,
  platformOperatorPasskeysRouter,
} from "../../../src/routes/admin/operator-passkeys.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { PLATFORM_WEBAUTHN_RP_NAME } from "../../../src/services/admin/platform-auth.service.js";
import {
  createOperatorSelfEnrolmentService,
  type OperatorSelfEnrolmentServiceDependencies,
} from "../../../src/services/admin/operator-self-enrolment.service.js";
import type { VerifiedRegistration } from "../../../src/services/admin/platform-webauthn.service.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled =
  platformOperatorTestsEnabled() &&
  Boolean(process.env.CONTROL_WEBAUTHN_RP_ID);
const EMAIL_PREFIX = "operator-add-passkey";
const TOKEN_PATH = "/enrolment/token";
const POST_METHOD = "POST";
const suffix = Date.now().toString(36);
const PUBLIC_KEY_TYPE = "public-key" as const;
const ENCODED_BASE64_URL = "eA";
const TEST_PUBLIC_KEY = "placeholder-public-key";

const registrationResponse: RegistrationResponseJSON = {
  id: "credential",
  rawId: ENCODED_BASE64_URL,
  type: PUBLIC_KEY_TYPE,
  response: {
    clientDataJSON: ENCODED_BASE64_URL,
    attestationObject: ENCODED_BASE64_URL,
  },
  clientExtensionResults: {},
};

let platformPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let fixture: OperatorFixture;

function dependencies(
  verifyRegistration?: OperatorSelfEnrolmentServiceDependencies["verifyRegistration"]
): OperatorSelfEnrolmentServiceDependencies {
  return {
    prisma: platformPrisma,
    redis,
    config: {
      rpID: getControlWebauthnRpId(),
      rpName: PLATFORM_WEBAUTHN_RP_NAME,
      origin: getControlPlaneOrigin(),
    },
    ...(verifyRegistration === undefined ? {} : { verifyRegistration }),
  };
}

async function verifiedFor(
  operatorId: string,
  token: string,
  credentialId: string
): Promise<VerifiedRegistration> {
  return {
    operatorId,
    tokenHash: await hashEnrolmentToken(token),
    credential: {
      id: credentialId,
      publicKey: TEST_PUBLIC_KEY,
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: [],
    },
  };
}

async function clearEnrolmentKeys(): Promise<void> {
  const keys = await redis.keys("platform:enrolment:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorPasskeysRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  platformPrisma = fixture.platformPrisma;
  ownerPrisma = fixture.ownerPrisma;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(OPERATOR_PASSKEYS_RATE_LIMIT_KEY);
  await clearEnrolmentKeys();
});

afterAll(async () => {
  if (!enabled) return;
  await clearEnrolmentKeys();
  await fixture.cleanup();
});

it.skipIf(!enabled)(
  "requires an authenticated control session to issue a token",
  async () => {
    const response = await sendOperatorRequest(platformOperatorPasskeysRouter, {
      method: POST_METHOD,
      path: TOKEN_PATH,
    });
    expect(response.status).toBe(401);
    const problem = await parseProblem(response);
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.AUTH_REQUIRED);
  }
);

it.skipIf(!enabled)("rejects a token request from a foreign origin", async () => {
  const response = await platformOperatorPasskeysRouter.request(
    TOKEN_PATH,
    {
      method: POST_METHOD,
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
    }
  );
  expect(response.status).toBe(403);
  const problem = await parseProblem(response);
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.CORS_ORIGIN_DENIED);
});

it.skipIf(!enabled)(
  "issues a token to an ACTIVE operator without requiring a capability",
  async () => {
    const operator = await fixture.createOperator([]);
    const response = await sendOperatorRequest(
      platformOperatorPasskeysRouter,
      {
        method: POST_METHOD,
        path: TOKEN_PATH,
        token: operator.token,
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { token: string | null; expiresAt: string };
    };
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(Date.parse(body.data.expiresAt)).toBeGreaterThan(Date.now());

    const audit = await ownerPrisma.auditEvent.findFirst({
      where: {
        actorOperatorId: operator.id,
        action: PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_ISSUED,
      },
    });
    expect(audit?.recordHash).toHaveLength(64);
  }
);

it.skipIf(!enabled)(
  "replays one idempotent token response and never stores the raw token",
  async () => {
    const operator = await fixture.createOperator([]);
    const idempotencyKey = `add-passkey-replay-${suffix}`;
    const first = await sendOperatorRequest(platformOperatorPasskeysRouter, {
      method: POST_METHOD,
      path: TOKEN_PATH,
      token: operator.token,
      idempotencyKey,
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { token: string | null };
    };
    expect(firstBody.data.token).not.toBeNull();

    const replay = await sendOperatorRequest(platformOperatorPasskeysRouter, {
      method: POST_METHOD,
      path: TOKEN_PATH,
      token: operator.token,
      idempotencyKey,
    });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    const replayBody = (await replay.json()) as {
      data: { token: string | null };
    };
    expect(replayBody.data.token).toBeNull();
  }
);

it.skipIf(!enabled)(
  "rejects an invalid token at the add-passkey options route",
  async () => {
    const response = await sendOperatorRequest(
      platformOperatorPasskeysRouter,
      {
        method: POST_METHOD,
        path: "/enrolment/add/options",
        body: { token: "a".repeat(43) },
      }
    );
    expect(response.status).toBe(401);
    const problem = await parseProblem(response);
    expect(problem.code).toBe(
      PLATFORM_ERROR_CODE.OPERATOR_ENROLMENT_INVALID
    );
  }
);

it.skipIf(!enabled)(
  "rejects an invalid token at the add-passkey verify route",
  async () => {
    const response = await sendOperatorRequest(
      platformOperatorPasskeysRouter,
      {
        method: POST_METHOD,
        path: "/enrolment/add/verify",
        body: {
          token: "a".repeat(43),
          flowId: "invalid-flow",
          response: registrationResponse,
        },
      }
    );
    expect(response.status).toBe(401);
    const problem = await parseProblem(response);
    expect(problem.code).toBe(
      PLATFORM_ERROR_CODE.OPERATOR_ENROLMENT_INVALID
    );
  }
);

it.skipIf(!enabled)("rate-limits the token endpoint", async () => {
  const responses = await Promise.all(
    Array.from({ length: 11 }, () =>
      sendOperatorRequest(platformOperatorPasskeysRouter, {
        method: POST_METHOD,
        path: TOKEN_PATH,
      })
    )
  );
  const statuses = responses.map((response) => response.status);
  expect(statuses.filter((status) => status === 401)).toHaveLength(10);
  expect(statuses.filter((status) => status === 429)).toHaveLength(1);
});

it.skipIf(!enabled)(
  "adds a passkey under the current RP and audits the completion",
  async () => {
    const operator = await fixture.createOperator([
      PLATFORM_CAPABILITIES.TENANTS_READ.code,
    ]);
    const credentialId = `add-credential-${suffix}`;
    const issued = await createOperatorSelfEnrolmentService(
      dependencies()
    ).issue({
      operatorId: operator.id,
      requestId: "req-add-issue",
    });
    const service = createOperatorSelfEnrolmentService(
      dependencies(() => verifiedFor(operator.id, issued.token, credentialId))
    );

    await service.start({ token: issued.token, requestId: "req-add-start" });
    const enrolled = await service.finish({
      token: issued.token,
      flowId: "flow-add",
      response: registrationResponse,
      requestId: "req-add-finish",
    });

    expect(enrolled).toMatchObject({
      id: operator.id,
      status: "ACTIVE",
      mfaEnrolled: true,
    });
    const passkey = await ownerPrisma.operatorPasskey.findUnique({
      where: { credentialId },
    });
    expect(passkey?.rpId).toBe(getControlWebauthnRpId());

    const audits = await ownerPrisma.auditEvent.findMany({
      where: {
        actorOperatorId: operator.id,
        action: {
          in: [
            PLATFORM_AUDIT_ACTIONS.PASSKEY_REGISTERED,
            PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_REVOKED,
          ],
        },
      },
    });
    expect(
      audits.some(
        (row) =>
          row.action === PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_REVOKED &&
          row.reason === PLATFORM_ENROLMENT_REVOCATION_REASONS.COMPLETED
      )
    ).toBe(true);
    expect(audits.every((row) => row.recordHash.length === 64)).toBe(true);
    await expect(readEnrolmentToken(redis, issued.token)).resolves.toBeNull();
  }
);

it.skipIf(!enabled)("consumes the token exactly once", async () => {
  const operator = await fixture.createOperator([]);
  const credentialId = `replay-credential-${suffix}`;
  const issued = await createOperatorSelfEnrolmentService(
    dependencies()
  ).issue({
    operatorId: operator.id,
    requestId: "req-replay-issue",
  });
  const service = createOperatorSelfEnrolmentService(
    dependencies(() => verifiedFor(operator.id, issued.token, credentialId))
  );
  const input = {
    token: issued.token,
    flowId: "flow-replay",
    response: registrationResponse,
    requestId: "req-replay-finish",
  };

  await service.finish(input);
  await expect(
    service.finish({ ...input, requestId: "req-replay-again" })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_ENROLMENT_INVALID,
  });

  const audits = await ownerPrisma.auditEvent.findMany({
    where: { actorOperatorId: operator.id },
    orderBy: { occurredAt: "desc" },
  });
  expect(
    audits.some(
      (row) =>
        row.action === PLATFORM_AUDIT_ACTIONS.ENROLMENT_FAILED &&
        row.reason === PLATFORM_ENROLMENT_REVOCATION_REASONS.TOKEN_REUSED
    )
  ).toBe(true);
});

it.skipIf(!enabled)(
  "revokes the token and audits failure when verification fails",
  async () => {
    const operator = await fixture.createOperator([]);
    const service = createOperatorSelfEnrolmentService(
      dependencies(() => Promise.reject(new Error("bad ceremony")))
    );
    const issued = await service.issue({
      operatorId: operator.id,
      requestId: "req-fail-issue",
    });

    await expect(
      service.finish({
        token: issued.token,
        flowId: "flow-fail",
        response: registrationResponse,
        requestId: "req-fail-finish",
      })
    ).rejects.toMatchObject({
      code: PLATFORM_ERROR_CODE.OPERATOR_ENROLMENT_INVALID,
    });

    await expect(readEnrolmentToken(redis, issued.token)).resolves.toBeNull();
    const audits = await ownerPrisma.auditEvent.findMany({
      where: { actorOperatorId: operator.id },
    });
    for (const action of [
      PLATFORM_AUDIT_ACTIONS.ENROLMENT_FAILED,
      PLATFORM_AUDIT_ACTIONS.ENROLMENT_TOKEN_REVOKED,
    ]) {
      expect(
        audits.some(
          (row) =>
            row.action === action &&
            row.reason === PLATFORM_ENROLMENT_REVOCATION_REASONS.VERIFICATION_FAILED
        )
      ).toBe(true);
    }
  }
);

it.skipIf(!enabled)("rejects a token bound to a different operator", async () => {
  const first = await fixture.createOperator([]);
  const second = await fixture.createOperator([]);
  const issued = await createOperatorSelfEnrolmentService(
    dependencies()
  ).issue({
    operatorId: first.id,
    requestId: "req-mismatch-issue",
  });
  const service = createOperatorSelfEnrolmentService(
    dependencies(() => verifiedFor(second.id, issued.token, `mismatch-${suffix}`))
  );

  await expect(
    service.finish({
      token: issued.token,
      flowId: "flow-mismatch",
      response: registrationResponse,
      requestId: "req-mismatch-finish",
    })
  ).rejects.toMatchObject({
    code: PLATFORM_ERROR_CODE.OPERATOR_ENROLMENT_INVALID,
  });

  const passkey = await ownerPrisma.operatorPasskey.findUnique({
    where: { credentialId: `mismatch-${suffix}` },
  });
  expect(passkey).toBeNull();
  const audit = await ownerPrisma.auditEvent.findFirst({
    where: {
      actorOperatorId: first.id,
      action: PLATFORM_AUDIT_ACTIONS.ENROLMENT_FAILED,
      reason: PLATFORM_ENROLMENT_REVOCATION_REASONS.OPERATOR_MISMATCH,
    },
  });
  expect(audit?.recordHash).toHaveLength(64);
});

it.skipIf(!enabled)(
  "revokes a control session issued under a previous RP identity",
  async () => {
    const operator = await fixture.createOperator([]);
    const stale = await issueControlSession({
      prisma: platformPrisma,
      secret: process.env.CONTROL_SESSION_SECRET ?? "",
      operatorId: operator.id,
      rpID: "old.example.com",
    });

    const response = await sendOperatorRequest(
      platformOperatorPasskeysRouter,
      {
        method: POST_METHOD,
        path: TOKEN_PATH,
        token: stale.token,
      }
    );
    expect(response.status).toBe(401);
    const stored = await ownerPrisma.operatorSession.findUnique({
      where: { id: stale.sessionId },
    });
    expect(stored?.revokedAt).not.toBeNull();
  }
);
