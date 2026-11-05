import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  problemTypeForErrorCode,
} from "@suite/core";
import {
  OPERATOR_RATE_LIMIT_KEY,
  platformOperatorsRouter,
} from "../../../src/routes/admin/operators.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
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
const EMAIL_PREFIX = "operator-contract";
const OPERATORS_PATH = "/";

const operatorSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().min(1),
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "REVOKED"]),
    mfaEnrolled: z.boolean(),
    lastSeenAt: z.string().datetime().nullable(),
    capabilities: z.array(z.string()),
  })
  .strict();

const createdOperatorSchema = z
  .object({
    operator: operatorSchema,
    admissionPending: z.literal(true),
    invitationExpiresAt: z.string().datetime(),
    invitationToken: z.string().min(32),
  })
  .strict();

const capabilitySetSchema = z
  .object({ capabilities: z.array(z.string()) })
  .strict();

const operatorSessionSchema = z
  .object({
    id: z.string().min(1),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    idleExpiresAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
  })
  .strict();

function envelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z
    .object({
      success: z.literal(true),
      data,
      requestId: z.string().min(1),
      timestamp: z.string().datetime(),
    })
    .strict();
}

let fixture: OperatorFixture;
let managerToken: string;
let limitedToken: string;

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformOperatorsRouter, input);
}

beforeAll(async () => {
  if (!enabled) return;
  platformOperatorsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(OPERATOR_RATE_LIMIT_KEY);
  managerToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code])
  ).token;
  limitedToken = (await fixture.createOperator([])).token;
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("keeps the operator page envelope and no token hash", async () => {
  const response = await send({
    method: "GET",
    path: `${OPERATORS_PATH}?limit=10`,
    token: managerToken,
  });
  expect(response.status).toBe(200);
  const body = envelopeSchema(
    z.object({
      items: z.array(operatorSchema),
      nextCursor: z.string().nullable(),
    })
  ).parse(await response.json());
  expect(body.data.items.length).toBeGreaterThan(0);
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("tokenHash");
  expect(serialized).not.toContain("invitationToken");
});

it.skipIf(!enabled)("keeps the invitation envelope and one-time token", async () => {
  const email = `${EMAIL_PREFIX}-${fixture.suffix}-invited@example.com`;
  const response = await send({
    method: "POST",
    path: OPERATORS_PATH,
    token: managerToken,
    body: { email, displayName: "Contract Invite", capabilities: [] },
  });
  expect(response.status).toBe(201);
  const body = envelopeSchema(createdOperatorSchema).parse(
    await response.json()
  );
  expect(body.data.operator.status).toBe("INVITED");
  expect(body.data.operator.email).toBe(email);

  const invitation = await fixture.ownerPrisma.operatorInvitation.findFirst({
    where: { email },
  });
  expect(invitation?.tokenHash).not.toBe(body.data.invitationToken);

  const duplicate = await send({
    method: "POST",
    path: OPERATORS_PATH,
    token: managerToken,
    body: { email, displayName: "Contract Invite", capabilities: [] },
  });
  expect(duplicate.status).toBe(409);
  expect((await parseProblem(duplicate)).code).toBe(
    PLATFORM_ERROR_CODE.OPERATOR_ALREADY_INVITED
  );
});

it.skipIf(!enabled)("keeps the RFC 7807 contract for denied requests", async () => {
  const cases = [
    {
      request: { method: "GET", path: OPERATORS_PATH },
      status: 401,
      code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    },
    {
      request: { method: "GET", path: OPERATORS_PATH, token: limitedToken },
      status: 403,
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
    },
    {
      request: {
        method: "POST",
        path: OPERATORS_PATH,
        token: managerToken,
        body: { email: "not-an-email", displayName: "Bad", capabilities: [] },
      },
      status: 422,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    },
    {
      request: {
        method: "PATCH",
        path: "/operator_missing_probe",
        token: managerToken,
        body: {
          status: "SUSPENDED",
          expectedStatus: "ACTIVE",
          reason: "Contract probe",
        },
      },
      status: 404,
      code: PLATFORM_ERROR_CODE.OPERATOR_NOT_FOUND,
    },
  ] as const;
  const results = await Promise.all(
    cases.map(async (testCase) => {
      const response = await send(testCase.request);
      return {
        testCase,
        response,
        problem: await parseProblem(response),
      };
    })
  );
  for (const { testCase, response, problem } of results) {
    expect(response.status).toBe(testCase.status);
    expect(problem.code).toBe(testCase.code);
    expect(problem.type).toBe(problemTypeForErrorCode(testCase.code));
  }
});

it.skipIf(!enabled)("keeps capability and session response contracts", async () => {
  const target = await fixture.createOperator([]);
  const grant = await send({
    method: "PATCH",
    path: `/${target.id}/capabilities`,
    token: managerToken,
    body: { grant: [PLATFORM_CAPABILITIES.TELEMETRY_READ.code] },
  });
  expect(grant.status).toBe(200);
  const capabilities = envelopeSchema(capabilitySetSchema).parse(
    await grant.json()
  );
  expect(capabilities.data.capabilities).toEqual([
    PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
  ]);

  const sessions = await send({
    method: "GET",
    path: `/${target.id}/sessions`,
    token: managerToken,
  });
  expect(sessions.status).toBe(200);
  const page = envelopeSchema(
    z.object({
      items: z.array(operatorSessionSchema),
      nextCursor: z.string().nullable(),
    })
  ).parse(await sessions.json());
  expect(page.data.items).toHaveLength(1);

  const revoke = await send({
    method: "DELETE",
    path: `/${target.id}/sessions/${page.data.items[0]?.id ?? ""}`,
    token: managerToken,
  });
  expect(revoke.status).toBe(204);
  expect(await revoke.text()).toBe("");
});
