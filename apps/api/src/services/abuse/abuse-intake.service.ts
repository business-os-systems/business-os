import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError, ValidationError } from "@suite/core/errors";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { resolvePublicSiteOrganization } from "@suite/website-builder/inquiries";
import { normalizeHost } from "./reputation-policy.js";

/**
 * Abuse report intake (FR-131, FR-136). Each report is one immutable CMS audit
 * row: the action is ABUSE_REPORT_RECEIVED, the target site is the entity, and
 * the outcome is recorded in the payload. The audit trail is already the
 * tenant-scoped, append-only evidence store with a declared retention window,
 * so a second report table would duplicate its guarantees.
 *
 * The submitted detail text is part of that evidence record. It never leaves
 * this service through a read route and is bounded by the request schema.
 */

const resolvedDomainSchema = z
  .object({ resolved: z.literal(true), siteId: z.string().min(1) })
  .passthrough();

export const ABUSE_REPORT_CATEGORIES = {
  SPAM: "SPAM",
  PHISHING: "PHISHING",
  MALWARE: "MALWARE",
  IMPERSONATION: "IMPERSONATION",
  HARASSMENT: "HARASSMENT",
  OTHER: "OTHER",
} as const;

export type AbuseReportCategory =
  (typeof ABUSE_REPORT_CATEGORIES)[keyof typeof ABUSE_REPORT_CATEGORIES];

export const ABUSE_REPORT_CATEGORY_VALUES = [
  ABUSE_REPORT_CATEGORIES.SPAM,
  ABUSE_REPORT_CATEGORIES.PHISHING,
  ABUSE_REPORT_CATEGORIES.MALWARE,
  ABUSE_REPORT_CATEGORIES.IMPERSONATION,
  ABUSE_REPORT_CATEGORIES.HARASSMENT,
  ABUSE_REPORT_CATEGORIES.OTHER,
] as const;

/** The intake outcome is the first state; later review moves it on. */
export const ABUSE_REPORT_OUTCOMES = {
  RECEIVED: "RECEIVED",
  TRIAGED: "TRIAGED",
  ACTIONED: "ACTIONED",
  DISMISSED: "DISMISSED",
} as const;

export type AbuseReportOutcome =
  (typeof ABUSE_REPORT_OUTCOMES)[keyof typeof ABUSE_REPORT_OUTCOMES];

export const ABUSE_REPORT_OUTCOME_VALUES = [
  ABUSE_REPORT_OUTCOMES.RECEIVED,
  ABUSE_REPORT_OUTCOMES.TRIAGED,
  ABUSE_REPORT_OUTCOMES.ACTIONED,
  ABUSE_REPORT_OUTCOMES.DISMISSED,
] as const;

export const ABUSE_REPORT_LIMITS = {
  hostnameMaxLength: 255,
  detailsMinLength: 20,
  detailsMaxLength: 5_000,
} as const;

/** A public reporter is not a platform user, so the actor is explicit. */
export const ABUSE_INTAKE_ACTOR = "public:abuse-report";

export interface AbuseReportInput {
  readonly hostname: string;
  /** The route validates this against the registry; the service re-checks it. */
  readonly category: string;
  readonly details: string;
}

export interface AbuseReportIntake {
  readonly reportId: string;
  readonly siteId: string;
  readonly outcome: AbuseReportOutcome;
  readonly receivedAt: string;
}

interface HostTarget {
  readonly siteId: string;
  readonly organizationId: string;
}

async function resolveHostTarget(hostname: string): Promise<HostTarget | null> {
  const rows = await prisma.$queryRaw<{ result: Prisma.JsonValue }[]>(Prisma.sql`
    SELECT public.cms_resolve_domain(${hostname}) AS result
  `);
  const resolved = resolvedDomainSchema.safeParse(rows[0]?.result);
  if (!resolved.success) {
    return null;
  }
  const organizationId = await resolvePublicSiteOrganization(resolved.data.siteId);
  return organizationId === null
    ? null
    : { siteId: resolved.data.siteId, organizationId };
}

function isAbuseReportCategory(value: string): value is AbuseReportCategory {
  return ABUSE_REPORT_CATEGORY_VALUES.some((category) => category === value);
}

interface ValidatedAbuseReport {
  readonly hostname: string;
  readonly category: AbuseReportCategory;
  readonly details: string;
}

function invalidReport(name: string, reason: string): ValidationError {
  return new ValidationError("The abuse report is invalid.", [{ name, reason }], {
    code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
  });
}

function normalizeHostname(hostname: string): string {
  const normalized = normalizeHost(hostname);
  if (normalized.length === 0 || normalized.length > ABUSE_REPORT_LIMITS.hostnameMaxLength) {
    throw invalidReport(
      "hostname",
      `Provide a hostname of at most ${ABUSE_REPORT_LIMITS.hostnameMaxLength} characters.`
    );
  }
  return normalized;
}

function normalizeDetails(details: string): string {
  const trimmed = details.trim();
  if (
    trimmed.length < ABUSE_REPORT_LIMITS.detailsMinLength ||
    trimmed.length > ABUSE_REPORT_LIMITS.detailsMaxLength
  ) {
    throw invalidReport(
      "details",
      `Provide between ${ABUSE_REPORT_LIMITS.detailsMinLength} and ${ABUSE_REPORT_LIMITS.detailsMaxLength} characters.`
    );
  }
  return trimmed;
}

function validateAbuseReport(input: AbuseReportInput): ValidatedAbuseReport {
  if (!isAbuseReportCategory(input.category)) {
    throw invalidReport("category", "Choose a declared abuse category.");
  }
  return {
    hostname: normalizeHostname(input.hostname),
    category: input.category,
    details: normalizeDetails(input.details),
  };
}

interface AbuseTarget {
  readonly target: HostTarget;
  readonly report: ValidatedAbuseReport;
}

async function insertAbuseReport({ target, report }: AbuseTarget): Promise<AbuseReportIntake> {
  const reportId = randomUUID();
  const receivedAt = new Date();
  await withTenantContext(target.organizationId, (tx) =>
    writeCmsAudit(tx, {
      organizationId: target.organizationId,
      siteId: target.siteId,
      action: CMS_AUDIT_ACTIONS.ABUSE_REPORT_RECEIVED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      entityId: target.siteId,
      actorUserId: ABUSE_INTAKE_ACTOR,
      changes: {
        reportId,
        category: report.category,
        hostname: report.hostname,
        details: report.details,
        outcome: ABUSE_REPORT_OUTCOMES.RECEIVED,
        receivedAt: receivedAt.toISOString(),
      },
    })
  );
  return {
    reportId,
    siteId: target.siteId,
    outcome: ABUSE_REPORT_OUTCOMES.RECEIVED,
    receivedAt: receivedAt.toISOString(),
  };
}

/**
 * Resolves the reported host to a published site and records the intake. An
 * unknown or unpublished host is a generic not-found so the endpoint does not
 * become a site-existence oracle.
 */
export async function recordAbuseReport(input: AbuseReportInput): Promise<AbuseReportIntake> {
  const report = validateAbuseReport(input);
  const target = await resolveHostTarget(report.hostname);
  if (target === null) {
    throw new NotFoundError("The reported host is not a published site on this platform.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return insertAbuseReport({ target, report });
}
