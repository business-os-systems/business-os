import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request as playwrightRequest, type BrowserContext } from "@playwright/test";
import { TENANT_SESSION_COOKIE_NAME } from "@suite/auth";
import { apiOrigin } from "./journey-environment";

/**
 * Journey fixtures (#379, OP-12).
 *
 * The journey exercises the real API and dashboard, so it needs a workspace,
 * an installing user and a publishing operator before it starts. The factory in
 * tooling/quality/e2e owns those rows because only a Node process can reach
 * PostgreSQL: the specs run inside the @suite/web package and deliberately do
 * not depend on the database client.
 *
 * Every call carries the run suffix, so two runs never collide and a retry
 * reuses its own workspace instead of a previous attempt's.
 */

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const FIXTURE_SCRIPT = "tooling/quality/e2e/scripts/real-journey-fixtures.ts";

export interface PreparedTenant {
  readonly suffix: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly tenantHost: string;
  readonly tenantSessionToken: string;
}

export interface PreparedJourney extends PreparedTenant {
  readonly operatorId: string;
  readonly operatorEmail: string;
  readonly operatorSessionToken: string;
}

/** A fresh, lower-case suffix so every run owns its ids and its host. */
export function createRunSuffix(): string {
  return (Date.now().toString(36) + randomBytes(3).toString("hex")).toLowerCase().slice(-16);
}

function runFixture<T>(args: readonly string[]): T {
  const stdout = execFileSync(
    "pnpm",
    ["exec", "tsx", FIXTURE_SCRIPT, ...args],
    { cwd: WORKSPACE_ROOT, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const lastLine = stdout.trim().split("\n").filter((line) => line.trim().length > 0).at(-1);
  if (lastLine === undefined) {
    throw new Error("The journey fixture printed no result.");
  }
  return JSON.parse(lastLine) as T;
}

export function prepareJourney(suffix: string): PreparedJourney {
  return runFixture<PreparedJourney>(["prepare", "--suffix", suffix]);
}

/** A workspace whose user has not verified the address yet and has no app. */
export function prepareUnverifiedTenant(suffix: string): PreparedTenant {
  return runFixture<PreparedTenant>(["prepare-unverified", "--suffix", suffix]);
}

/**
 * An API context that speaks as the journey's tenant, so a spec can assert what
 * the server stored rather than what the page happened to render.
 */
export async function createTenantApiContext(session: PreparedTenant) {
  return playwrightRequest.newContext({
    baseURL: apiOrigin(),
    extraHTTPHeaders: { cookie: TENANT_SESSION_COOKIE_NAME + "=" + session.tenantSessionToken },
  });
}

/**
 * Installs the tenant session the dashboard and the API both verify. The
 * cookie is scoped to the journey host, exactly as the real session is.
 */
export async function installTenantSession(
  context: BrowserContext,
  session: PreparedTenant
): Promise<void> {
  await context.addCookies([
    {
      name: TENANT_SESSION_COOKIE_NAME,
      value: session.tenantSessionToken,
      domain: session.tenantHost,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}