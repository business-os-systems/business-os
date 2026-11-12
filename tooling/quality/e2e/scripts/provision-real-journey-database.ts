import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Scratch-database provisioning for the real-API first-website journey
 * (#379, T180).
 *
 * The Playwright project at apps/web/tests/e2e-real runs the API, the
 * dashboard and the storefront against a database that is created here, so a
 * journey never shares the development database and never resets it. Nothing
 * in this script drops a row or a database: the migrations are forward-only
 * and the starter catalog seed is insert-only, so running it twice is safe.
 *
 * Every URL comes from a pre-declared variable; the script rewrites nothing.
 * It refuses to run until all three identities name the same scratch database,
 * which is what keeps a misdirected variable from migrating a shared one.
 *
 * Usage, with the three URLs exported by the caller:
 *
 *   DATABASE_URL=postgresql://businessos_admin:...@localhost:5432/business_os_real_journey \
 *   PLATFORM_DATABASE_URL=postgresql://app_platform:...@localhost:5432/business_os_real_journey \
 *   TENANT_DATABASE_URL=postgresql://app_tenant:...@localhost:5432/business_os_real_journey \
 *   pnpm exec tsx tooling/quality/e2e/scripts/provision-real-journey-database.ts
 *
 * The same three variables are read by apps/web/playwright.real.config.ts, so
 * the provisioned database is the one the journey talks to.
 */

const REAL_JOURNEY_DATABASE_NAME = "business_os_real_journey";

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DB_PACKAGE_DIR = resolve(WORKSPACE_ROOT, "packages/db");
const MAINTENANCE_DATABASE = "postgres";
const ALREADY_EXISTS = "already exists";

const REQUIRED_DATABASE_URL_VARIABLES = [
  "DATABASE_URL",
  "PLATFORM_DATABASE_URL",
  "TENANT_DATABASE_URL",
] as const;

type DatabaseUrlVariable = (typeof REQUIRED_DATABASE_URL_VARIABLES)[number];

/** The inherited process environment, passed explicitly so a child gets it. */
type Environment = Record<string, string | undefined>;

interface DatabaseTarget {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly username: string;
  readonly password: string;
}

interface ProvisioningSummary {
  readonly database: string;
  readonly host: string;
  readonly port: string;
  readonly starterCatalogSeeded: boolean;
}

function readRequiredUrl(name: DatabaseUrlVariable): string {
  const value = process.env[name]?.trim() ?? "";
  if (value === "") {
    throw new Error(
      name + " must be declared so the scratch database can be provisioned.",
    );
  }
  return value;
}

function parseTarget(name: DatabaseUrlVariable): DatabaseTarget {
  const parsed = new URL(readRequiredUrl(name));
  const database = parsed.pathname.replace(/^\//, "");
  if (database === "" || database === MAINTENANCE_DATABASE) {
    throw new Error(
      name + " must name a database, not the maintenance connection.",
    );
  }
  return {
    host: parsed.hostname,
    port: parsed.port === "" ? "5432" : parsed.port,
    database,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

/** One URL per identity, all pointing at the same scratch database. */
function readScratchDatabaseTargets(): readonly DatabaseTarget[] {
  const targets = REQUIRED_DATABASE_URL_VARIABLES.map((name) => parseTarget(name));
  const [first] = targets;
  if (first === undefined) {
    throw new Error("No database URL is declared.");
  }
  for (const target of targets) {
    const mismatch =
      target.host !== first.host ||
      target.port !== first.port ||
      target.database !== first.database;
    if (mismatch) {
      throw new Error(
        "DATABASE_URL, PLATFORM_DATABASE_URL and TENANT_DATABASE_URL must name the same host, port and database; " +
          target.database +
          " differs from " +
          first.target.database +
          ".",
      );
    }
    if (target.database !== REAL_JOURNEY_DATABASE_NAME) {
      throw new Error(
        "The journey database must be named " +
          REAL_JOURNEY_DATABASE_NAME +
          "; refusing to migrate and seed " +
          target.database +
          ".",
      );
    }
  }
  return targets;
}

function connectionUrl(target: DatabaseTarget, database: string): string {
  const credentials =
    encodeURIComponent(target.username) + ":" + encodeURIComponent(target.password);
  return "postgresql://" + credentials + "@" + target.host + ":" + target.port + "/" + database;
}

function maintenanceUrl(target: DatabaseTarget): string {
  return connectionUrl(target, MAINTENANCE_DATABASE);
}

function runPrisma(args: readonly string[], env: Environment): string {
  return execFileSync(
    "pnpm",
    ["--filter", "@suite/db", "exec", "prisma", ...args],
    { cwd: WORKSPACE_ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function executeSql(url: string, sql: string, env: Environment): string {
  return execFileSync(
    "pnpm",
    ["--filter", "@suite/db", "exec", "prisma", "db", "execute", "--url", url, "--stdin"],
    { cwd: WORKSPACE_ROOT, env, encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function readCommandError(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const stdout = Reflect.get(error, "stdout");
  const stderr = Reflect.get(error, "stderr");
  const stdoutText = typeof stdout === "string" ? stdout : "";
  const stderrText = typeof stderr === "string" ? stderr : "";
  return [stdoutText, stderrText].join("\n");
}

/**
 * Creates the scratch database when it does not exist. A duplicate is the
 * expected outcome of a rerun, so it is recognised by the server's own message
 * and every other failure is rethrown.
 */
function createScratchDatabase(target: DatabaseTarget, env: Environment): boolean {
  const sql = 'CREATE DATABASE "' + target.database + '"';
  try {
    executeSql(maintenanceUrl(target), sql, env);
    return true;
  } catch (error: unknown) {
    if (readCommandError(error).includes(ALREADY_EXISTS)) {
      return false;
    }
    throw error;
  }
}

function quoteLiteral(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

/**
 * The migrations create app_platform and app_tenant without a password (the
 * deployment secret store owns it). A scratch database needs those identities
 * to log in, so the password already present in each URL is applied to its
 * role after the migration that creates it. The value never appears in a log
 * line.
 */
function provisionRuntimeRolePasswords(
  targets: readonly DatabaseTarget[],
  env: Environment,
): void {
  const [admin, platform, tenant] = targets;
  if (admin === undefined || platform === undefined || tenant === undefined) {
    throw new Error("Three database targets are required.");
  }
  executeSql(
    maintenanceUrl(admin),
    "ALTER ROLE app_platform WITH LOGIN PASSWORD " + quoteLiteral(platform.password) + ";",
    env,
  );
  executeSql(
    maintenanceUrl(admin),
    "ALTER ROLE app_tenant WITH LOGIN PASSWORD " + quoteLiteral(tenant.password) + ";",
    env,
  );
}

/**
 * The CI test job re-asserts this correction after migrations so the media
 * quota projection is deterministic even on a database that recorded an
 * earlier view revision. A scratch database gets the same treatment for the
 * same reason.
 */
const USAGE_PROJECTION_CORRECTION =
  "prisma/schema/migrations/20261111190000_platform_usage_media_storage_fix/migration.sql";

function applyUsageProjectionCorrection(target: DatabaseTarget): void {
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@suite/db",
      "exec",
      "prisma",
      "db",
      "execute",
      "--url",
      baseUrl(target),
      "--file",
      USAGE_PROJECTION_CORRECTION,
    ],
    { cwd: DB_PACKAGE_DIR, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function migrate(target: DatabaseTarget): void {
  const env = { ...process.env, DATABASE_URL: baseUrl(target), DIRECT_URL: baseUrl(target) };
  runPrisma(["migrate", "deploy", "--schema=prisma/schema"], env);
}

function baseUrl(target: DatabaseTarget): string {
  return connectionUrl(target, target.database);
}

function seedStarterCatalog(target: DatabaseTarget): void {
  const env = { ...process.env, DATABASE_URL: baseUrl(target) };
  execFileSync("pnpm", ["exec", "tsx", "src/seed-starter-catalog.ts"], {
    cwd: DB_PACKAGE_DIR,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function provisionRealJourneyDatabase(): ProvisioningSummary {
  const targets = readScratchDatabaseTargets();
  const [target] = targets;
  if (target === undefined) {
    throw new Error("No scratch database target is declared.");
  }
  process.stdout.write(
    "Provisioning scratch database " + target.database + " on " + target.host + ":" + target.port + "\n",
  );
  const created = createScratchDatabase(target, process.env);
  process.stdout.write(
    created ? "Scratch database created.\n" : "Scratch database already exists; reusing it.\n",
  );
  // The migration creates app_platform and app_tenant, so the runtime passwords
  // can only be applied once it has run: a fresh cluster has no roles at all.
  migrate(target);
  applyUsageProjectionCorrection(target);
  provisionRuntimeRolePasswords(targets, process.env);
  seedStarterCatalog(target);
  process.stdout.write("Migrations applied and the starter catalog seeded.\n");
  return {
    database: target.database,
    host: target.host,
    port: target.port,
    starterCatalogSeeded: true,
  };
}

/**
 * CLI lifecycle: report the failure and exit non-zero so CI stops before it
 * boots three applications against an unfinished database.
 */
const entrypoint = process.argv[1];
// prettier-ignore
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    provisionRealJourneyDatabase();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : readCommandError(error);
    process.stderr.write("Scratch database provisioning failed: " + message + "\n");
    process.exitCode = 1;
  }
}