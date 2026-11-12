import { pathToFileURL } from "node:url";
import { prisma } from "../../../../packages/db/src/index.js";
import { PERMISSIONS, PLATFORM_CAPABILITIES } from "../../../../packages/core/src/index.js";
import {
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "../../../../packages/auth/src/index.js";
import { issueControlSession } from "../../../../packages/auth/src/platform/index.js";
import {
  getControlSessionSecret,
  getControlWebauthnRpId,
} from "../../../../apps/api/src/lib/platform-env.js";
import { WEBSITE_BUILDER_MANIFEST } from "../../../../packages/modules/website-builder/src/manifest.js";

/**
 * Fixture factory for the real-API first-website journey (#379, T180).
 *
 * The journey runs the real API and dashboard against the scratch database, so
 * it needs one operator, one workspace and one installed application before
 * the operator can publish and the tenant can create a site. This factory
 * writes those rows and mints the two sessions; it never mocks an endpoint.
 *
 * Commands (stdout is JSON so the Playwright spec can parse the result):
 *
 *   prepare --suffix <suffix>
 *     Creates the workspace, its operator user, the installed Website Builder
 *     application, and one publishing operator. Prints the ids, the tenant
 *     host and both signed session tokens.
 *
 *   prepare-unverified --suffix <suffix>
 *     Creates a workspace and a user whose email is not verified yet, with no
 *     installed application. This is the state the install-later journey starts
 *     from: the tester still has to complete verification.
 *
 * Every id carries the run suffix, so two runs never collide and a retry
 * reuses its own rows instead of a previous attempt's.
 */

const SUFFIX_PATTERN = /^[a-z0-9]{4,32}$/;
const DOMAIN_ROOT = "localhost";
const OPERATOR_CAPABILITIES = [
  PLATFORM_CAPABILITIES.APPS_READ.code,
  PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
  PLATFORM_CAPABILITIES.APPS_PUBLISH.code,
] as const;
const TENANT_CAPABILITIES = [
  PERMISSIONS.CORE.ORGANIZATION_READ,
  PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
  PERMISSIONS.WEBSITE_BUILDER.PAGES_READ,
  PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE,
  PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW,
  PERMISSIONS.WEBSITE_BUILDER.PUBLISH,
  PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  PERMISSIONS.WEBSITE_BUILDER.LEADS_PII,
  PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE,
  PERMISSIONS.APPS.INSTALL,
] as const;

/** A workspace plus the signed tenant session the dashboard and API verify. */
export interface PreparedTenant {
  readonly suffix: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly tenantHost: string;
  readonly tenantSessionToken: string;
}

/** A workspace plus the publishing operator the catalog half of the journey uses. */
export interface PreparedJourney extends PreparedTenant {
  readonly operatorId: string;
  readonly operatorEmail: string;
  readonly operatorSessionToken: string;
}

interface WorkspaceInput {
  readonly suffix: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly emailVerified: boolean;
  readonly userName: string;
}

function readFlag(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined || value.trim() === "") {
    throw new Error(name + " is required.");
  }
  return value.trim();
}

function readSuffix(argv: readonly string[]): string {
  const suffix = readFlag(argv, "--suffix");
  if (!SUFFIX_PATTERN.test(suffix)) {
    throw new Error("--suffix must be 4 to 32 lower-case letters or digits.");
  }
  return suffix;
}

export function journeyTenantHost(suffix: string): string {
  return "journey-" + suffix + "." + DOMAIN_ROOT;
}

async function upsertWorkspace(input: WorkspaceInput): Promise<void> {
  await prisma.organization.upsert({
    where: { id: input.organizationId },
    update: { name: input.organizationName, status: "ACTIVE" },
    create: {
      id: input.organizationId,
      name: input.organizationName,
      slug: "journey-" + input.suffix,
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { id: input.userId },
    update: { emailVerified: input.emailVerified },
    create: {
      id: input.userId,
      email: input.userEmail,
      name: input.userName,
      emailVerified: input.emailVerified,
    },
  });
}

async function upsertInstalledWebsiteBuilder(organizationId: string): Promise<void> {
  await prisma.installedApp.upsert({
    where: {
      organizationId_appId: {
        organizationId,
        appId: WEBSITE_BUILDER_MANIFEST.appId,
      },
    },
    update: { isEnabled: true },
    create: {
      organizationId,
      appId: WEBSITE_BUILDER_MANIFEST.appId,
      isEnabled: true,
      settings: {
        title: "Website Builder",
        href: "/sites",
        iconName: "sites",
        permission: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
      },
    },
  });
}

async function upsertPublishingOperator(
  suffix: string,
): Promise<{ readonly operatorId: string; readonly operatorEmail: string }> {
  const operatorEmail = "journey-operator-" + suffix + "@example.test";
  const operator = await prisma.platformOperator.upsert({
    where: { email: operatorEmail },
    update: { status: "ACTIVE", mfaEnrolled: true },
    create: {
      email: operatorEmail,
      displayName: "Journey Publishing Operator",
      status: "ACTIVE",
      mfaEnrolled: true,
    },
  });
  await prisma.operatorCapability.createMany({
    data: OPERATOR_CAPABILITIES.map((capability) => ({
      operatorId: operator.id,
      capability,
    })),
    skipDuplicates: true,
  });
  return { operatorId: operator.id, operatorEmail };
}

interface TenantSessionInput {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly tenantHost: string;
}

function buildTenantSession(input: TenantSessionInput): SessionPayload {
  const now = Date.now();
  return {
    userId: input.userId,
    email: input.userEmail,
    userName: "Journey Operator",
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    role: "journey-publisher",
    permissions: [...TENANT_CAPABILITIES],
    onboardingStatus: "COMPLETED",
    tenantHost: input.tenantHost,
    timestamp: now,
    issuedAt: now,
    expiresAt: now + 60 * 60 * 1000,
    isEphemeral: false,
  };
}

async function mintTenantSession(input: TenantSessionInput): Promise<string> {
  return signSessionToken(encodeSessionPayload(buildTenantSession(input)));
}

async function prepare(argv: readonly string[]): Promise<PreparedJourney> {
  const suffix = readSuffix(argv);
  const organizationId = "org_journey_" + suffix;
  const organizationName = "Journey Studio " + suffix;
  const userId = "usr_journey_" + suffix;
  const userEmail = "journey-" + suffix + "@example.test";
  const tenantHost = journeyTenantHost(suffix);

  await upsertWorkspace({
    suffix,
    organizationId,
    organizationName,
    userId,
    userEmail,
    emailVerified: true,
    userName: "Journey Operator",
  });
  await upsertInstalledWebsiteBuilder(organizationId);
  const operator = await upsertPublishingOperator(suffix);
  const controlSession = await issueControlSession({
    prisma,
    secret: getControlSessionSecret(),
    rpID: getControlWebauthnRpId(),
    operatorId: operator.operatorId,
  });
  const tenantSessionToken = await mintTenantSession({
    organizationId,
    organizationName,
    userId,
    userEmail,
    tenantHost,
  });

  return {
    suffix,
    organizationId,
    organizationName,
    userId,
    userEmail,
    tenantHost,
    tenantSessionToken,
    operatorId: operator.operatorId,
    operatorEmail: operator.operatorEmail,
    operatorSessionToken: controlSession.token,
  };
}

async function prepareUnverified(argv: readonly string[]): Promise<PreparedTenant> {
  const suffix = readSuffix(argv);
  const organizationId = "org_unverified_" + suffix;
  const organizationName = "Unverified Studio " + suffix;
  const userId = "usr_unverified_" + suffix;
  const userEmail = "unverified-" + suffix + "@example.test";
  const tenantHost = journeyTenantHost(suffix);

  await upsertWorkspace({
    suffix,
    organizationId,
    organizationName,
    userId,
    userEmail,
    emailVerified: false,
    userName: "Unverified Operator",
  });
  const tenantSessionToken = await mintTenantSession({
    organizationId,
    organizationName,
    userId,
    userEmail,
    tenantHost,
  });

  return {
    suffix,
    organizationId,
    organizationName,
    userId,
    userEmail,
    tenantHost,
    tenantSessionToken,
  };
}

async function run(argv: readonly string[]): Promise<unknown> {
  const [command] = argv;
  if (command === "prepare") {
    return prepare(argv);
  }
  if (command === "prepare-unverified") {
    return prepareUnverified(argv);
  }
  throw new Error(
    "Unknown command " + String(command) + "; use prepare or prepare-unverified.",
  );
}

/**
 * CLI lifecycle. The database client is closed before the process exits so a
 * caller reading stdout sees the complete JSON line, and the explicit exit
 * keeps a stray imported connection (the auth package pulls in Redis) from
 * holding the process open after the work is done.
 */
async function main(): Promise<void> {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("Journey fixture failed: " + message + "\n");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
  process.exit(process.exitCode ?? 0);
}

const entrypoint = process.argv[1];
// prettier-ignore
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) void main();