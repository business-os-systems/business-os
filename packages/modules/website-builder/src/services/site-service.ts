import { randomUUID } from "node:crypto";
import { prisma, type PrismaClient } from "@suite/db";
import { getHostModelConfig } from "@suite/core";
import { ValidationError } from "@suite/core/errors";
import { provisionSiteFromTemplate, siteHostname } from "./site-provisioning.js";

export interface CreateSiteInput {
  organizationId: string;
  branchId?: string | null;
  title: string;
  slug: string;
  primaryLocale?: string;
  brandName?: string;
  /** The published catalog TEMPLATE item this site copies (FR-017). */
  templateId?: string | null;
  /** The verified session user recorded in the creation audit. */
  actorUserId?: string;
  /** Replay key for create-from-template (CT-4). */
  idempotencyKey?: string;
  /**
   * The unmounted admin prototype still constructs these two fields in its
   * request type. They are refused here: a site starts from a published
   * catalog template and its clock comes from its tenant branch.
   */
  initialTemplate?: string;
  timezone?: string;
}

export interface SiteSummary {
  id: string;
  organizationId: string;
  branchId: string | null;
  title: string;
  slug: string;
  status: string;
  timezone: string;
  primaryLocale: string;
  pagesCount: number;
  primaryDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubdomainAvailabilityResult {
  subdomain: string;
  available: boolean;
  suggestions: string[];
}

/** Actor recorded for an internal caller that has no verified session user. */
const INTERNAL_PROVISIONING_ACTOR = "internal:site-provisioning";

function rejectLegacyProvisioningFields(input: CreateSiteInput): void {
  if (input.initialTemplate !== undefined) {
    throw new ValidationError(
      "initialTemplate is no longer accepted; choose a published catalog template.",
      [{ name: "initialTemplate", reason: "Pass a published templateId instead." }],
      { code: "VALIDATION_FAILED" },
    );
  }
  if (input.timezone !== undefined) {
    throw new ValidationError(
      "A site timezone is derived from its tenant branch and cannot be supplied.",
      [{ name: "timezone", reason: "Select an operational branch with the intended timezone." }],
      { code: "VALIDATION_FAILED" },
    );
  }
}

/**
 * Service for multi-tenant CmsSite domain operations backed by PostgreSQL via Prisma.
 * Creation delegates to the one provisioning implementation so the dashboard,
 * the API and the module share the same transaction, pages and audit row.
 */
export class SiteService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Lists all sites belonging to the specified organization with aggregate page counts.
   */
  public async listSites(organizationId: string): Promise<SiteSummary[]> {
    const sites = await this.db.cmsSite.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { pages: true },
        },
        domains: {
          where: { isPrimary: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return sites.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      branchId: s.branchId,
      title: s.title,
      slug: s.slug,
      status: s.status,
      timezone: s.timezone,
      primaryLocale: s.primaryLocale,
      pagesCount: s._count.pages,
      primaryDomain: s.domains[0]?.hostname ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  /**
   * Retrieves single site metadata with settings and domains, enforcing strict tenant boundary.
   */
  public async getSite(organizationId: string, siteId: string) {
    return this.db.cmsSite.findUnique({
      where: {
        id_organizationId: {
          id: siteId,
          organizationId,
        },
      },
      include: {
        settings: true,
        seoSettings: true,
        domains: true,
      },
    });
  }

  /**
   * Checks subdomain availability across the entire platform.
   * If claimed, dynamically queries DB to find available alternatives.
   */
  public async checkSubdomainAvailability(subdomain: string): Promise<SubdomainAvailabilityResult> {
    const normalized = subdomain
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-");
    const hostRoot = getHostModelConfig().tenantRootDomain;
    const fullHostname = siteHostname(normalized, hostRoot);

    const existingDomain = await this.db.cmsDomain.findUnique({
      where: { hostname: fullHostname },
    });

    if (!existingDomain) {
      return {
        subdomain: normalized,
        available: true,
        suggestions: [],
      };
    }

    const candidates = Array.from({ length: 10 }, (_, index) => `${normalized}-${index + 1}`);
    const conflicts = await Promise.all(
      candidates.map((candidate) =>
        this.db.cmsDomain.findUnique({
          where: { hostname: siteHostname(candidate, hostRoot) },
        }),
      ),
    );
    const suggestions = candidates.filter((_, index) => conflicts[index] === null).slice(0, 3);

    return {
      subdomain: normalized,
      available: false,
      suggestions,
    };
  }

  /**
   * Provisions a brand-new website atomically inside one ACID transaction:
   * site, settings, host-model primary domain, appearance snapshot, every
   * copied PageAst page and the creation audit row.
   */
  public async createSite(input: CreateSiteInput) {
    rejectLegacyProvisioningFields(input);
    return provisionSiteFromTemplate({
      organizationId: input.organizationId,
      branchId: input.branchId ?? null,
      actorUserId: input.actorUserId ?? INTERNAL_PROVISIONING_ACTOR,
      title: input.title,
      slug: input.slug,
      templateId: input.templateId ?? null,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      primaryLocale: input.primaryLocale ?? null,
      brandName: input.brandName ?? null,
    });
  }

  /**
   * Deletes a site and cascades all child pages and domains, strictly isolated to tenant.
   */
  public async deleteSite(organizationId: string, siteId: string): Promise<boolean> {
    const site = await this.db.cmsSite.findUnique({
      where: {
        id_organizationId: {
          id: siteId,
          organizationId,
        },
      },
    });

    if (!site) return false;

    await this.db.cmsSite.delete({
      where: {
        id_organizationId: {
          id: siteId,
          organizationId,
        },
      },
    });

    return true;
  }
}

/**
 * The one provisioning implementation lives in site-provisioning so the
 * authenticated API and the dashboard BFF share it.
 */
export * from "./site-provisioning.js";
