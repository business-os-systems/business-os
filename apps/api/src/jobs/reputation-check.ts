import { pathToFileURL } from "node:url";
import { logger } from "@suite/logger";
import { withTenantContext, type PrismaClient } from "@suite/db";
import {
  CMS_AUDIT_ACTIONS,
  CMS_AUDIT_ENTITY_TYPES,
} from "@suite/website-builder/audit";
import { writeCmsAudit } from "@suite/website-builder/services";
import { getReputationFeedPath } from "../lib/env.js";
import { getPlatformPrismaClient } from "../lib/platform-db.js";
import {
  ReputationFeedUnavailableError,
  loadReputationFeed,
  type ReputationFeed,
} from "../services/abuse/reputation-feed.js";
import {
  REPUTATION_VERDICTS,
  classifyVerdict,
  normalizeHost,
  structuralSignals,
  type AbuseSignal,
  type ReputationVerdict,
} from "../services/abuse/reputation-policy.js";

/**
 * Reputation and structural abuse check (FR-134, T123). Runs at publish and
 * daily. A configured feed that cannot be read fails the publish path closed;
 * the daily path records FEED_UNAVAILABLE and continues, so a feed outage can
 * never silently suspend or drop a legitimate site. Verdicts are audit rows,
 * not a second state table, and an unchanged verdict is not recorded twice.
 */

export const REPUTATION_TRIGGERS = {
  PUBLISH: "PUBLISH",
  DAILY: "DAILY",
} as const;

export type ReputationTrigger =
  (typeof REPUTATION_TRIGGERS)[keyof typeof REPUTATION_TRIGGERS];

/** A publish-time blocked host; the publish must not proceed. */
export class ReputationBlockedHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReputationBlockedHostError";
  }
}

const DEFAULT_MAX_SITES = 200;
const ACTOR = "system:reputation-check";

interface SiteRow {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly domains: readonly { readonly hostname: string }[];
}

interface OrganisationRow {
  readonly id: string;
}

export interface SiteVerdict {
  readonly siteId: string;
  readonly hostnames: readonly string[];
  readonly signals: readonly AbuseSignal[];
  readonly blockedHosts: readonly string[];
  readonly verdict: ReputationVerdict;
}

export interface ReputationCheckResult {
  readonly trigger: ReputationTrigger;
  readonly checked: number;
  readonly passed: number;
  readonly review: number;
  readonly blocked: number;
  readonly feedUnavailable: number;
  readonly recorded: number;
}

interface CheckContext {
  readonly trigger: ReputationTrigger;
  readonly feed: ReputationFeed | null;
  readonly feedUnavailable: boolean;
  readonly maxSites: number;
  readonly organizationId?: string;
  readonly siteIds: readonly string[];
}

function countVerdict(result: ReputationCheckResult, verdict: ReputationVerdict): ReputationCheckResult {
  return {
    ...result,
    passed: result.passed + (verdict === REPUTATION_VERDICTS.PASS ? 1 : 0),
    review: result.review + (verdict === REPUTATION_VERDICTS.REVIEW ? 1 : 0),
    blocked: result.blocked + (verdict === REPUTATION_VERDICTS.BLOCKED ? 1 : 0),
    feedUnavailable:
      result.feedUnavailable + (verdict === REPUTATION_VERDICTS.FEED_UNAVAILABLE ? 1 : 0),
  };
}

function assessSite(
  site: SiteRow,
  context: CheckContext,
  activeHostCount: number
): SiteVerdict {
  const hostnames = site.domains.map((domain) => normalizeHost(domain.hostname));
  const blockedHosts = hostnames.filter((host) =>
    context.feed?.blockedHosts.has(host) === true
  );
  const signals = hostnames.flatMap((hostname) =>
    structuralSignals({ hostname, activeHostCount })
  );
  const uniqueSignals = [...new Set(signals)];
  return {
    siteId: site.id,
    hostnames,
    signals: uniqueSignals,
    blockedHosts,
    verdict: classifyVerdict({
      signals: uniqueSignals,
      blocked: blockedHosts.length > 0,
      feedUnavailable: context.feedUnavailable,
    }),
  };
}

function readRecordedVerdict(value: unknown): {
  readonly verdict?: string;
  readonly feedUpdatedAt?: string;
  readonly signals?: readonly string[];
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.verdict === "string" ? { verdict: record.verdict } : {}),
    ...(typeof record.feedUpdatedAt === "string"
      ? { feedUpdatedAt: record.feedUpdatedAt }
      : {}),
    ...(Array.isArray(record.signals)
      ? { signals: record.signals.filter((item): item is string => typeof item === "string") }
      : {}),
  };
}

function sameSignalSet(left: readonly string[] | undefined, right: readonly string[]): boolean {
  const current = left ?? [];
  if (current.length !== right.length) return false;
  return [...current].sort().join("|") === [...right].sort().join("|");
}

/** Idempotent: an unchanged verdict for the same feed version is not re-audited. */
async function recordVerdict(
  organizationId: string,
  verdict: SiteVerdict,
  context: CheckContext
): Promise<boolean> {
  const feedVersion = context.feedUnavailable
    ? "UNAVAILABLE"
    : (context.feed?.updatedAt ?? "STRUCTURAL_ONLY");
  return withTenantContext(organizationId, async (tx) => {
    const latest = await tx.cmsAuditTrail.findFirst({
      where: {
        organizationId,
        siteId: verdict.siteId,
        action: CMS_AUDIT_ACTIONS.REPUTATION_VERDICT_RECORDED,
      },
      orderBy: { createdAt: "desc" },
      select: { changesJson: true },
    });
    const recorded = readRecordedVerdict(latest?.changesJson ?? null);
    if (
      recorded.verdict === verdict.verdict &&
      recorded.feedUpdatedAt === feedVersion &&
      sameSignalSet(recorded.signals, verdict.signals)
    ) {
      return false;
    }
    await writeCmsAudit(tx, {
      organizationId,
      siteId: verdict.siteId,
      action: CMS_AUDIT_ACTIONS.REPUTATION_VERDICT_RECORDED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      entityId: verdict.siteId,
      actorUserId: ACTOR,
      changes: {
        verdict: verdict.verdict,
        signals: [...verdict.signals],
        blockedHosts: [...verdict.blockedHosts],
        hostnames: [...verdict.hostnames],
        feedUpdatedAt: feedVersion,
        trigger: context.trigger,
      },
    });
    return true;
  });
}

async function readSites(
  organizationId: string,
  context: CheckContext
): Promise<{ sites: readonly SiteRow[]; activeHostCount: number }> {
  return withTenantContext(organizationId, async (tx) => {
    const where = {
      organizationId,
      status: "PUBLISHED" as const,
      ...(context.siteIds.length === 0 ? {} : { id: { in: [...context.siteIds] } }),
    };
    const [sites, activeHostCount] = await Promise.all([
      tx.cmsSite.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: context.maxSites,
        select: {
          id: true,
          title: true,
          slug: true,
          domains: {
            where: { status: "ACTIVE" },
            orderBy: { hostname: "asc" },
            select: { hostname: true },
          },
        },
      }),
      tx.cmsDomain.count({ where: { organizationId, status: "ACTIVE" } }),
    ]);
    return { sites, activeHostCount };
  });
}

async function organisationIds(
  prisma: PrismaClient,
  context: CheckContext
): Promise<readonly string[]> {
  if (context.organizationId !== undefined) {
    return [context.organizationId];
  }
  const rows = await prisma.organization.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] } },
    orderBy: { id: "asc" },
    take: context.maxSites,
    select: { id: true },
  });
  return rows.map((row: OrganisationRow) => row.id);
}

function logVerdict(verdict: SiteVerdict, trigger: ReputationTrigger): void {
  if (verdict.verdict === REPUTATION_VERDICTS.PASS) return;
  logger.warn(
    {
      trigger,
      siteId: verdict.siteId,
      verdict: verdict.verdict,
      signals: verdict.signals,
      hostnames: verdict.hostnames,
    },
    "Reputation check recorded a non-passing verdict"
  );
}

async function readFeed(trigger: ReputationTrigger): Promise<{
  readonly feed: ReputationFeed | null;
  readonly feedUnavailable: boolean;
}> {
  try {
    return { feed: await loadReputationFeed(getReputationFeedPath()), feedUnavailable: false };
  } catch (error) {
    if (!(error instanceof ReputationFeedUnavailableError)) throw error;
    if (trigger === REPUTATION_TRIGGERS.PUBLISH) throw error;
    logger.error({ error: error.message }, "Reputation feed unavailable; daily check continues");
    return { feed: null, feedUnavailable: true };
  }
}

interface SiteOutcome {
  readonly verdict: SiteVerdict;
  readonly recorded: boolean;
}

async function checkOneSite(input: {
  readonly organizationId: string;
  readonly site: SiteRow;
  readonly context: CheckContext;
  readonly activeHostCount: number;
}): Promise<SiteOutcome | null> {
  try {
    const verdict = assessSite(input.site, input.context, input.activeHostCount);
    const recorded = await recordVerdict(input.organizationId, verdict, input.context);
    logVerdict(verdict, input.context.trigger);
    return { verdict, recorded };
  } catch (error) {
    if (input.context.trigger === REPUTATION_TRIGGERS.PUBLISH) throw error;
    logger.error(
      {
        siteId: input.site.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Reputation check skipped a site after an error"
    );
    return null;
  }
}

export async function runReputationCheck(
  options: {
    readonly trigger: ReputationTrigger;
    readonly organizationId?: string;
    readonly siteIds?: readonly string[];
    readonly maxSites?: number;
  }
): Promise<ReputationCheckResult> {
  const feed = await readFeed(options.trigger);
  const context: CheckContext = {
    trigger: options.trigger,
    feed: feed.feed,
    feedUnavailable: feed.feedUnavailable,
    maxSites: options.maxSites ?? DEFAULT_MAX_SITES,
    ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    siteIds: options.siteIds ?? [],
  };
  const prisma = getPlatformPrismaClient();
  let result: ReputationCheckResult = {
    trigger: context.trigger,
    checked: 0,
    passed: 0,
    review: 0,
    blocked: 0,
    feedUnavailable: 0,
    recorded: 0,
  };
  for (const organizationId of await organisationIds(prisma, context)) {
    const { sites, activeHostCount } = await readSites(organizationId, context);
    for (const site of sites) {
      const outcome = await checkOneSite({
        organizationId,
        site,
        context,
        activeHostCount,
      });
      if (outcome === null) continue;
      result = countVerdict(
        {
          ...result,
          checked: result.checked + 1,
          recorded: result.recorded + (outcome.recorded ? 1 : 0),
        },
        outcome.verdict.verdict
      );
    }
  }
  logger.info(
    { trigger: result.trigger, checked: result.checked, recorded: result.recorded },
    "Reputation check completed"
  );
  return result;
}

/** Publish gate: a blocked host or an unavailable feed stops publishing. */
export async function assertPublishReputationClear(input: {
  readonly organizationId: string;
  readonly siteIds: readonly string[];
}): Promise<void> {
  const result = await runReputationCheck({
    trigger: REPUTATION_TRIGGERS.PUBLISH,
    organizationId: input.organizationId,
    siteIds: input.siteIds,
  });
  if (result.blocked > 0) {
    throw new ReputationBlockedHostError(
      "A published host is blocked by the threat-reputation feed."
    );
  }
}

function readArgument(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function readTrigger(): ReputationTrigger {
  return readArgument("trigger") === REPUTATION_TRIGGERS.PUBLISH
    ? REPUTATION_TRIGGERS.PUBLISH
    : REPUTATION_TRIGGERS.DAILY;
}

async function main(): Promise<void> {
  const organizationId = readArgument("org");
  const siteIds = readArgument("sites")?.split(",").filter(Boolean) ?? [];
  const result = await runReputationCheck({
    trigger: readTrigger(),
    ...(organizationId === undefined ? {} : { organizationId }),
    siteIds,
  });
  logger.info(result, "Reputation check finished");
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(
      "Reputation check failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  });
}
