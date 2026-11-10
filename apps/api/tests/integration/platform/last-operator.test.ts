import { afterAll, beforeAll, expect, it } from "vitest";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import { issueControlSession } from "@suite/auth/platform";
import {
  OPERATOR_RATE_LIMIT_KEY,
  platformOperatorsRouter,
} from "../../../src/routes/admin/operators.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { assertAnotherOperatorManager } from "../../../src/services/admin/operator-guard.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  sendOperatorRequest,
  platformOperatorTestsEnabled,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const EMAIL_PREFIX = "last-operator";
const MANAGE = PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code;

let fixture: OperatorFixture;

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformOperatorsRouter, input);
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(OPERATOR_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

// This suite proves the allow path and the denial path. The denial test below
// revokes every other manager *inside the transaction that the guard's throw
// rolls back*, so no committed manager state changes while parallel suites run.
it.skipIf(!enabled)("allows demotion once a second manager is active", async () => {
  const target = await fixture.createOperator([MANAGE]);
  const keeper = await fixture.createOperator([MANAGE]);
  const revoke = await send({
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: keeper.token,
    body: { revoke: [MANAGE] },
  });
  expect(revoke.status).toBe(200);

  // FR-059: the revoke also rotated the target's session; re-authenticate to
  // prove the capability is gone rather than only the cookie.
  const reissued = await issueControlSession({
    prisma: fixture.platformPrisma,
    secret: process.env.CONTROL_SESSION_SECRET ?? "",
    operatorId: target.id,
  });
  const denied = await send({
    method: "GET",
    path: "/",
    token: reissued.token,
  });
  expect(denied.status).toBe(403);
  expect((await parseProblem(denied)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );
});

it.skipIf(!enabled)("blocks the last manager inside a real transaction", async () => {
  const last = await fixture.createOperator([MANAGE]);
  const managersBefore = await fixture.ownerPrisma.operatorCapability.count({
    where: {
      capability: MANAGE,
      revokedAt: null,
      operatorId: { not: last.id },
    },
  });
  await expect(
    fixture.ownerPrisma.$transaction(async (tx) => {
      // Uncommitted on purpose: the guard's throw rolls this transaction back.
      await tx.operatorCapability.updateMany({
        where: {
          capability: MANAGE,
          revokedAt: null,
          operatorId: { not: last.id },
        },
        data: { revokedAt: new Date() },
      });
      const target = await tx.platformOperator.findUniqueOrThrow({
        where: { id: last.id },
        include: { capabilities: { where: { revokedAt: null } } },
      });
      await assertAnotherOperatorManager(tx, target);
      throw new Error("The last-operator guard did not fire");
    })
  ).rejects.toMatchObject({ code: PLATFORM_ERROR_CODE.LAST_OPERATOR_GUARD });
  const managersAfter = await fixture.ownerPrisma.operatorCapability.count({
    where: {
      capability: MANAGE,
      revokedAt: null,
      operatorId: { not: last.id },
    },
  });
  expect(managersAfter).toBe(managersBefore);
});
