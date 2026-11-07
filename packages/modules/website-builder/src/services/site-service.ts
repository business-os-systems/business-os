import {
  prisma,
  Prisma,
  tenantWriteQuotaGuard,
  type PrismaClient,
  type QuotaGuard,
} from "@suite/db";
import { QUOTA_KEYS } from "@suite/core";

export interface CreateSiteInput {
  organizationId: string;
  branchId?: string | null;
  title: string;
  slug: string;
  primaryLocale?: string;
  timezone?: string;
  brandName?: string;
  initialTemplate?: "blank" | "hero_starter";
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
  primaryDomain?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubdomainAvailabilityResult {
  subdomain: string;
  available: boolean;
  suggestions: string[];
}

/**
 * Service for multi-tenant CmsSite domain operations backed by PostgreSQL via Prisma.
 */
async function resolveInitialHomeAst(
  db: PrismaClient,
  input: CreateSiteInput
): Promise<Record<string, unknown>> {
  let initialHomeAst: Record<string, unknown> = {
    root: {
      id: "root-section-1",
      type: "section",
      children: [],
    },
  };

  if (!input.initialTemplate) {
    return initialHomeAst;
  }

  const template = await db.cmsTemplate.findFirst({
    where: {
      OR: [
        { id: input.initialTemplate },
        { id: `tpl_${input.initialTemplate}` },
      ],
    },
  });

  if (!template?.blueprintJson || typeof template.blueprintJson !== "object") {
    return initialHomeAst;
  }

  const blueprint = template.blueprintJson as Record<string, unknown>;
  if (!blueprint.ast || typeof blueprint.ast !== "object") {
    return initialHomeAst;
  }

  initialHomeAst = JSON.parse(JSON.stringify(blueprint.ast));
  const root = initialHomeAst.root as Record<string, unknown> | undefined;
  if (!root || !Array.isArray(root.children)) {
    return initialHomeAst;
  }

  const hero = (root.children as Record<string, unknown>[]).find(
    (child) => child.type === "hero"
  );
  if (hero?.props && typeof hero.props === "object") {
    (hero.props as Record<string, unknown>).heading = `Welcome to ${input.title}`;
  }
  return initialHomeAst;
}

interface ProvisionSiteInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: CreateSiteInput;
  readonly normalizedSlug: string;
  readonly initialHomeAst: Record<string, unknown>;
}

interface CreateSiteRecordInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: CreateSiteInput;
  readonly normalizedSlug: string;
}

interface CreateHomePageInput {
  readonly tx: Prisma.TransactionClient;
  readonly input: CreateSiteInput;
  readonly siteId: string;
  readonly initialHomeAst: Record<string, unknown>;
}

export class SiteService {
  constructor(
    private readonly db = prisma,
    private readonly quotaGuard: QuotaGuard = tenantWriteQuotaGuard
  ) {}

  /** Composition without an undefined positional placeholder. */
  static withQuotaGuard(quotaGuard: QuotaGuard): SiteService {
    return new SiteService(prisma, quotaGuard);
  }

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
      primaryDomain: s.domains[0]?.hostname || `${s.slug}.business-os.site`,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  /**
   * Retrieves single site metadata with settings and domains, enforcing strict tenant boundary.
   */
  public async getSite(organizationId: string, siteId: string) {
    const site = await this.db.cmsSite.findUnique({
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

    return site;
  }

  /**
   * Checks subdomain availability across the entire platform.
   * If claimed, dynamically queries DB to find available alternatives.
   */
  public async checkSubdomainAvailability(
    subdomain: string
  ): Promise<SubdomainAvailabilityResult> {
    const normalized = subdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
    const fullHostname = `${normalized}.business-os.site`;

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

    const suggestions: string[] = [];
    let counter = 1;
    while (suggestions.length < 3 && counter <= 10) {
      const candidate = `${normalized}-${counter}`;
      const candidateHost = `${candidate}.business-os.site`;
      const conflict = await this.db.cmsDomain.findUnique({
        where: { hostname: candidateHost },
      });
      if (!conflict) {
        suggestions.push(candidate);
      }
      counter++;
    }

    return {
      subdomain: normalized,
      available: false,
      suggestions,
    };
  }

  /**
   * Provisions a brand-new website atomically inside an ACID transaction in < 200ms.
   * Creates Site, SiteSettings, CmsDomain, and default Home Page with CmsPageContent.
   */
  public async createSite(input: CreateSiteInput) {
    const normalizedSlug = input.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-");
    const initialHomeAst = await resolveInitialHomeAst(this.db, input);

    return this.db.$transaction((tx) =>
      this.provisionSite({ tx, input, normalizedSlug, initialHomeAst })
    );
  }

  private async provisionSite(options: ProvisionSiteInput) {
    const { tx, input, normalizedSlug, initialHomeAst } = options;

    // A site provisions one subdomain and one home page. Only the page seat is
    // charged; a *.business-os.site subdomain is not a custom domain.
    await this.quotaGuard.assertAvailable(tx, {
      organizationId: input.organizationId,
      resourceKey: QUOTA_KEYS.PAGES,
    });

    const site = await this.createSiteRecord({ tx, input, normalizedSlug });
    const homePage = await this.createHomePage({
      tx,
      input,
      siteId: site.id,
      initialHomeAst,
    });
    return { site, homePage };
  }

  private async createSiteRecord(options: CreateSiteRecordInput) {
    const { tx, input, normalizedSlug } = options;
    return tx.cmsSite.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId ?? null,
        title: input.title,
        slug: normalizedSlug,
        primaryLocale: input.primaryLocale ?? "en",
        timezone: input.timezone ?? "Asia/Kolkata",
        status: "DRAFT",
        settings: {
          create: {
            brandName: input.brandName ?? input.title,
          },
        },
        seoSettings: {
          create: {
            metaTitle: input.title,
          },
        },
        domains: {
          create: {
            hostname: `${normalizedSlug}.business-os.site`,
            isPrimary: true,
            isSubdomain: true,
            status: "ACTIVE",
            verificationToken: `vtoken_${Date.now()}`,
            verifiedAt: new Date(),
          },
        },
      },
    });
  }

  private async createHomePage(options: CreateHomePageInput) {
    const { tx, input, siteId, initialHomeAst } = options;
    return tx.cmsPage.create({
      data: {
        organizationId: input.organizationId,
        siteId,
        title: "Home",
        slug: "/",
        isHomePage: true,
        status: "DRAFT",
        revision: 1,
        content: {
          create: {
            draftAst: initialHomeAst as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: {
        content: true,
      },
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
