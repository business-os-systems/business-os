import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import {
  APP_SETTINGS_READ_RATE_LIMIT_KEY,
  APP_SETTINGS_WRITE_RATE_LIMIT_KEY,
  platformAppSettingsRouter,
} from "../../../src/routes/admin/app-settings.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const APP_ID = "website-builder";

const viewSchema = z
  .object({
    appId: z.string(),
    schema: z.object({ fields: z.array(z.unknown()) }),
    values: z.record(z.unknown()),
    effectiveValues: z.record(z.unknown()),
    sources: z.record(z.enum(["tenant", "app", "schema"])),
    staleFields: z.array(z.object({ name: z.string(), reason: z.string() })),
    version: z.string().min(1),
  })
  .strict();

const writeResultSchema = viewSchema
  .extend({ removedFields: z.array(z.string()) })
  .strict();

const envelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.unknown(),
    requestId: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();

let fixture: OperatorFixture;
let authorToken: string;
let readerToken: string;
let limitedToken: string;
let managerOperatorId: string;

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}): Promise<Response> {
  return sendOperatorRequest(platformAppSettingsRouter, input);
}

async function read(): Promise<z.infer<typeof viewSchema>> {
  const response = await send({ method: "GET", path: `/${APP_ID}/settings`, token: readerToken });
  expect(response.status).toBe(200);
  const body = envelopeSchema.parse(await response.json());
  return viewSchema.parse(body.data);
}

function write(
  values: Record<string, unknown>,
  expectedVersion: string,
  key = `defaults-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): Promise<Response> {
  return send({
    method: "PATCH",
    path: `/${APP_ID}/settings`,
    token: authorToken,
    body: { values, expectedVersion },
    idempotencyKey: key,
  });
}

beforeAll(async () => {
  if (!enabled) return;
  platformAppSettingsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("app-settings-defaults");
  await clearRateLimitStore(APP_SETTINGS_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(APP_SETTINGS_WRITE_RATE_LIMIT_KEY);
  const author = await fixture.createOperator([
    PLATFORM_CAPABILITIES.APPS_READ.code,
    PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
  ]);
  authorToken = author.token;
  managerOperatorId = author.id;
  readerToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_READ.code])
  ).token;
  limitedToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])
  ).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(APP_SETTINGS_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(APP_SETTINGS_WRITE_RATE_LIMIT_KEY);
  await fixture.ownerPrisma.appSettingsDefault.deleteMany({ where: { appId: APP_ID } });
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.ownerPrisma.appSettingsDefault.deleteMany({ where: { appId: APP_ID } });
  await fixture.cleanup();
});

it.skipIf(!enabled)("reads schema defaults before any application default exists", async () => {
  const view = await read();
  expect(view.version).toBe("0");
  expect(view.values).toEqual({});
  expect(view.effectiveValues).toEqual({
    customDomainEnabled: false,
    defaultLocale: "en",
  });
  expect(view.sources).toEqual({
    customDomainEnabled: "schema",
    defaultLocale: "schema",
  });
});

it.skipIf(!enabled)("writes a validated default and audits it", async () => {
  const response = await write({ customDomainEnabled: true }, "0");
  expect(response.status).toBe(200);
  const body = writeResultSchema.parse((envelopeSchema.parse(await response.json())).data);
  expect(body.values).toEqual({ customDomainEnabled: true });
  expect(body.effectiveValues).toEqual({
    customDomainEnabled: true,
    defaultLocale: "en",
  });
  expect(body.sources.customDomainEnabled).toBe("app");
  expect(body.version).toBe("1");

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      action: PLATFORM_AUDIT_ACTIONS.APP_SETTINGS_DEFAULTS_SET,
      entityId: APP_ID,
    },
  });
  expect(audit?.after).toMatchObject({ values: { customDomainEnabled: true } });
});

it.skipIf(!enabled)("rejects a create when the caller expects an existing row", async () => {
  const response = await write({}, "1");
  expect(response.status).toBe(409);
});

it.skipIf(!enabled)("increments the version on a second write", async () => {
  expect((await write({ customDomainEnabled: true }, "0")).status).toBe(200);
  const second = await write({ customDomainEnabled: false }, "1");
  expect(second.status).toBe(200);
  const body = writeResultSchema.parse(
    (envelopeSchema.parse(await second.json())).data,
  );
  expect(body.version).toBe("2");
  expect(body.effectiveValues.customDomainEnabled).toBe(false);
});

it.skipIf(!enabled)("rejects a stale defaults version", async () => {
  expect((await write({ customDomainEnabled: true }, "0")).status).toBe(200);
  const stale = await write({ customDomainEnabled: false }, "0");
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(PLATFORM_ERROR_CODE.VERSION_CONFLICT);
});

it.skipIf(!enabled)("rejects a malformed or unsafe version token", async () => {
  const malformed = await write({}, "not-a-version");
  expect(malformed.status).toBe(409);
  const unsafe = await write({}, "9007199254740993");
  expect(unsafe.status).toBe(409);
});

it.skipIf(!enabled)("fails closed when stored defaults are not an object", async () => {
  await fixture.ownerPrisma.appSettingsDefault.create({
    data: {
      appId: APP_ID,
      settings: [],
      version: 1,
      updatedBy: managerOperatorId,
    },
  });
  const response = await send({
    method: "GET",
    path: `/${APP_ID}/settings`,
    token: readerToken,
  });
  expect(response.status).toBe(500);
});

it.skipIf(!enabled)("rejects an unknown setting key", async () => {
  const response = await write({ unknownSetting: true }, "0");
  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.SETTINGS_INVALID);
});

it.skipIf(!enabled)("requires the author capability for writes", async () => {
  const response = await send({
    method: "PATCH",
    path: `/${APP_ID}/settings`,
    token: readerToken,
    body: { values: {}, expectedVersion: "0" },
    idempotencyKey: `reader-${Date.now().toString(36)}`,
  });
  expect(response.status).toBe(403);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
});

it.skipIf(!enabled)("denies reads without the read capability", async () => {
  const response = await send({ method: "GET", path: `/${APP_ID}/settings`, token: limitedToken });
  expect(response.status).toBe(403);
});

it.skipIf(!enabled)("requires an Idempotency-Key on the defaults write", async () => {
  const response = await platformAppSettingsRouter.request(`/${APP_ID}/settings`, {
    method: "PATCH",
    headers: {
      Origin: process.env.CONTROL_PLANE_ORIGIN ?? "",
      Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${authorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: {}, expectedVersion: "0" }),
  });
  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED,
  );
});
