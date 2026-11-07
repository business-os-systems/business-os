import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import { problemDetailsSchema } from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  hashOperatorInvitationToken,
  issueControlSession,
} from "@suite/auth/platform";
import { IDEMPOTENCY_HEADER } from "@suite/redis";
import type { z } from "zod";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  disconnectPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "./platform-db.js";

const FORWARDED_FOR = "198.51.100.40";

function requireEnv(name: "CONTROL_SESSION_SECRET" | "CONTROL_PLANE_ORIGIN"): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} must be set for Platform operator tests`);
  }
  return value.trim();
}

/** The session-bearing operator suites require both the platform DB and a secret. */
export function platformOperatorTestsEnabled(): boolean {
  return (
    platformIntegrationTestsEnabled() &&
    Boolean(process.env.CONTROL_SESSION_SECRET)
  );
}

export interface RequestableRouter {
  request(path: string, init: RequestInit): Response | Promise<Response>;
}

export interface SendRequestInput {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  /** Fixed key for a deliberate replay; otherwise every mutation gets a fresh one. */
  readonly idempotencyKey?: string;
}

export interface InvitationFixture {
  readonly operatorId: string;
  readonly invitationId: string;
  readonly email: string;
  readonly token: string;
  readonly tokenHash: string;
}

export interface OperatorFixture {
  readonly platformPrisma: PrismaClient;
  readonly ownerPrisma: PrismaClient;
  readonly suffix: string;
  createOperator(
    capabilities: readonly string[]
  ): Promise<{ readonly id: string; readonly token: string }>;
  createInvitedOperator(
    capabilities?: readonly string[]
  ): Promise<InvitationFixture>;
  cleanup(): Promise<void>;
}

interface FixtureState {
  readonly platformPrisma: PrismaClient;
  readonly ownerPrisma: PrismaClient;
  readonly emailPrefix: string;
  readonly suffix: string;
  readonly operatorIds: string[];
  readonly invitationIds: string[];
}

async function createOperatorRow(
  state: FixtureState,
  status: "ACTIVE" | "INVITED"
) {
  const operator = await state.platformPrisma.platformOperator.create({
    data: {
      email: `${state.emailPrefix}-${state.suffix}-${randomUUID()}@example.com`,
      displayName: "Fixture Operator",
      status,
      mfaEnrolled: status === "ACTIVE",
    },
  });
  state.operatorIds.push(operator.id);
  return operator;
}

async function grant(
  state: FixtureState,
  operatorId: string,
  capabilities: readonly string[]
): Promise<void> {
  if (capabilities.length === 0) return;
  await state.platformPrisma.operatorCapability.createMany({
    data: capabilities.map((capability) => ({ operatorId, capability })),
  });
}

async function createActiveOperator(
  state: FixtureState,
  capabilities: readonly string[]
) {
  const operator = await createOperatorRow(state, "ACTIVE");
  await grant(state, operator.id, capabilities);
  const issued = await issueControlSession({
    prisma: state.platformPrisma,
    secret: requireEnv("CONTROL_SESSION_SECRET"),
    operatorId: operator.id,
  });
  return { id: operator.id, token: issued.token };
}

async function createInvitedOperator(
  state: FixtureState,
  inviterId: string,
  capabilities: readonly string[]
): Promise<InvitationFixture> {
  const operator = await createOperatorRow(state, "INVITED");
  await grant(state, operator.id, capabilities);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashOperatorInvitationToken(token);
  const invitation = await state.platformPrisma.operatorInvitation.create({
    data: {
      email: operator.email,
      tokenHash,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  state.invitationIds.push(invitation.id);
  return {
    operatorId: operator.id,
    invitationId: invitation.id,
    email: operator.email,
    token,
    tokenHash,
  };
}

async function cleanupFixture(state: FixtureState): Promise<void> {
  const { ownerPrisma, operatorIds, invitationIds } = state;
  await ownerPrisma.auditEvent.deleteMany({
    where: {
      OR: [
        { entityId: { in: [...operatorIds, ...invitationIds] } },
        { actorOperatorId: { in: operatorIds } },
      ],
    },
  });
  await ownerPrisma.operatorPasskey.deleteMany({
    where: { operatorId: { in: operatorIds } },
  });
  await ownerPrisma.operatorSession.deleteMany({
    where: { operatorId: { in: operatorIds } },
  });
  await ownerPrisma.operatorCapability.deleteMany({
    where: { operatorId: { in: operatorIds } },
  });
  await ownerPrisma.operatorInvitation.deleteMany({
    where: {
      OR: [
        { id: { in: invitationIds } },
        { email: { startsWith: state.emailPrefix } },
      ],
    },
  });
  await ownerPrisma.platformOperator.deleteMany({
    where: { id: { in: operatorIds } },
  });
  await disconnectPlatformTestClient(state.platformPrisma);
  await disconnectPlatformTestClient(ownerPrisma);
}

/**
 * Deterministic operator fixtures for the Platform suites (OP-12). Every row is
 * namespaced by the suite prefix and captured so cleanup never truncates a
 * shared table.
 */
export async function createOperatorFixture(
  emailPrefix: string
): Promise<OperatorFixture> {
  const state: FixtureState = {
    platformPrisma: createPlatformTestClient(),
    ownerPrisma: createPlatformOwnerTestClient(),
    emailPrefix,
    suffix: Date.now().toString(36),
    operatorIds: [],
    invitationIds: [],
  };
  const inviter = await createOperatorRow(state, "ACTIVE");
  return {
    platformPrisma: state.platformPrisma,
    ownerPrisma: state.ownerPrisma,
    suffix: state.suffix,
    createOperator: (capabilities) =>
      createActiveOperator(state, capabilities),
    createInvitedOperator: (capabilities = []) =>
      createInvitedOperator(state, inviter.id, capabilities),
    cleanup: () => cleanupFixture(state),
  };
}

export function sendOperatorRequest(
  router: RequestableRouter,
  input: SendRequestInput
): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: requireEnv("CONTROL_PLANE_ORIGIN"),
    "X-Forwarded-For": FORWARDED_FOR,
  };
  if (input.token !== undefined) {
    headers.Cookie = `${CONTROL_SESSION_COOKIE_NAME}=${input.token}`;
  }
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (input.method !== "GET") {
    headers[IDEMPOTENCY_HEADER] = input.idempotencyKey ?? randomUUID();
  }
  return Promise.resolve(
    router.request(input.path, {
      method: input.method,
      headers,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    })
  );
}

export async function parseProblem(
  response: Response
): Promise<z.infer<typeof problemDetailsSchema>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/problem+json")) {
    throw new Error(
      `Expected application/problem+json, received ${contentType || "none"}`
    );
  }
  return problemDetailsSchema.parse(await response.json());
}
