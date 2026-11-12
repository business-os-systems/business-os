import { Prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ServiceUnavailableError, ValidationError } from "@suite/core/errors";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { getReputationFeedPath } from "../../lib/env.js";
import {
  ReputationFeedUnavailableError,
  loadReputationFeed,
  type ReputationFeed,
} from "../abuse/reputation-feed.js";
import {
  REPUTATION_VERDICTS,
  classifyVerdict,
  normalizeHost,
  structuralSignals,
  type AbuseSignal,
  type ReputationVerdict,
} from "../abuse/reputation-policy.js";

/**
 * Publish-time reputation consultation (FR-134, T160). The periodic job keeps
 * sweeping afterwards; publish is the gate that must run before a flagged host
 * can go live. The check is deliberately separate from the job's PUBLISHED-only
 * sweep because the site being released is still DRAFT on its first publish.
 *
 * A configured feed that cannot be read fails the publish closed (503). A host
 * listed by the feed refuses the publish (422); a structural REVIEW signal is
 * recorded but does not block, matching the periodic policy.
 */

export interface PublishReputationInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly actorUserId: string;
}

const PUBLISH_REPUTATION_TRIGGER = "PUBLISH" as const;

/** The feed is optional; structural checks still run without one. */
const STRUCTURAL_ONLY_FEED_VERSION = "STRUCTURAL_ONLY" as const;

interface SiteReputationContext {
  readonly hostnames: readonly string[];
  readonly activeHostCount: number;
}

export interface PublishVerdict {
  readonly verdict: ReputationVerdict;
  readonly hostnames: readonly string[];
  readonly signals: readonly AbuseSignal[];
  readonly blockedHosts: readonly string[];
}

/**
 * Carries the blocked verdict out of the release transaction. The release must
 * roll back, but the verdict is still audit evidence, so the caller records it
 * in its own transaction before returning the refusal.
 */
export class PublishReputationBlockedError extends ValidationError {
  readonly verdict: PublishVerdict;
  readonly feedUpdatedAt: string;

  constructor(verdict: PublishVerdict, feedUpdatedAt: string) {
    super(
      "A published host is blocked by the threat-reputation feed. Remove or change the host before publishing.",
      [{ name: "hostname", reason: "The host is listed by the reputation feed." }],
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
    this.name = "PublishReputationBlockedError";
    this.verdict = verdict;
    this.feedUpdatedAt = feedUpdatedAt;
  }
}

function unavailableFeed(error: unknown): ServiceUnavailableError {
  return new ServiceUnavailableError(
    "The threat-reputation feed is configured but could not be read. Publishing is blocked until it is available.",
    { code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE, cause: error }
  );
}

export async function loadPublishReputationFeed(): Promise<ReputationFeed | null> {
  try {
    return await loadReputationFeed(getReputationFeedPath());
  } catch (error: unknown) {
    const normalized =
      error instanceof ReputationFeedUnavailableError ? unavailableFeed(error) : error;
    throw normalized;
  }
}

interface SiteContextReader {
  readonly tx: Prisma.TransactionClient;
  readonly input: PublishReputationInput;
}

async function readSiteReputationContext({
  tx,
  input,
}: SiteContextReader): Promise<SiteReputationContext> {
  const site = await tx.cmsSite.findFirstOrThrow({
    where: { id: input.siteId, organizationId: input.organizationId },
    select: {
      domains: {
        where: { status: "ACTIVE" },
        orderBy: { hostname: "asc" },
        select: { hostname: true },
      },
    },
  });
  const activeHostCount = await tx.cmsDomain.count({
    where: { organizationId: input.organizationId, status: "ACTIVE" },
  });
  return {
    hostnames: site.domains.map((domain) => normalizeHost(domain.hostname)),
    activeHostCount,
  };
}

function assessPublishVerdict(
  context: SiteReputationContext,
  feed: ReputationFeed | null
): PublishVerdict {
  const blockedHosts = context.hostnames.filter(
    (hostname) => feed?.blockedHosts.has(hostname) === true
  );
  const signals = [
    ...new Set(
      context.hostnames.flatMap((hostname) =>
        structuralSignals({ hostname, activeHostCount: context.activeHostCount })
      )
    ),
  ];
  return {
    verdict: classifyVerdict({
      signals,
      blocked: blockedHosts.length > 0,
      feedUnavailable: false,
    }),
    hostnames: context.hostnames,
    signals,
    blockedHosts,
  };
}

interface PublishVerdictRecord {
  readonly tx: Prisma.TransactionClient;
  readonly input: PublishReputationInput;
  readonly verdict: PublishVerdict;
  readonly feedUpdatedAt: string;
}

async function recordPublishVerdict({
  tx,
  input,
  verdict,
  feedUpdatedAt,
}: PublishVerdictRecord): Promise<void> {
  await writeCmsAudit(tx, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    action: CMS_AUDIT_ACTIONS.REPUTATION_VERDICT_RECORDED,
    entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
    entityId: input.siteId,
    actorUserId: input.actorUserId,
    changes: {
      verdict: verdict.verdict,
      signals: [...verdict.signals],
      blockedHosts: [...verdict.blockedHosts],
      hostnames: [...verdict.hostnames],
      feedUpdatedAt,
      trigger: PUBLISH_REPUTATION_TRIGGER,
    },
  });
}

/**
 * Runs inside the publish transaction so the verdict and the release commit or
 * roll back together. A site with no active host is not blocked by reputation;
 * there is nothing a visitor can reach yet.
 */
interface PublishConsultInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: PublishReputationInput;
  readonly feed: ReputationFeed | null;
}

export async function assertPublishReputationClear({
  tx,
  input,
  feed,
}: PublishConsultInput): Promise<void> {
  const context = await readSiteReputationContext({ tx, input });
  if (context.hostnames.length === 0) {
    return;
  }
  const verdict = assessPublishVerdict(context, feed);
  const feedUpdatedAt = feed?.updatedAt ?? STRUCTURAL_ONLY_FEED_VERSION;
  if (verdict.verdict === REPUTATION_VERDICTS.BLOCKED) {
    throw new PublishReputationBlockedError(verdict, feedUpdatedAt);
  }
  await recordPublishVerdict({ tx, input, verdict, feedUpdatedAt });
}

/** Persists a blocked verdict after the release transaction rolled back. */
export async function recordPublishReputationRefusal(
  input: PublishReputationInput,
  error: PublishReputationBlockedError
): Promise<void> {
  await withTenantContext(input.organizationId, (tx) =>
    recordPublishVerdict({
      tx,
      input,
      verdict: error.verdict,
      feedUpdatedAt: error.feedUpdatedAt,
    })
  );
}
