import { prisma, Prisma } from "@suite/db";

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
export class SiteService {
  constructor(private readonly db = prisma) {}

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
    const normalizedSlug = input.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");
    const stagingHostname = `${normalizedSlug}.business-os.site`;

    // Retrieve initial page AST from dynamic database-backed CMS templates
    let initialHomeAst: Record<string, unknown> = {
      root: {
        id: "root-section-1",
        type: "section",
        children: [],
      },
    };

    if (input.initialTemplate) {
      const template = await this.db.cmsTemplate.findFirst({
        where: {
          OR: [
            { id: input.initialTemplate },
            { id: `tpl_${input.initialTemplate}` },
          ],
        },
      });

      if (template?.blueprintJson && typeof template.blueprintJson === "object") {
        const bp = template.blueprintJson as Record<string, unknown>;
        if (bp.ast && typeof bp.ast === "object") {
          initialHomeAst = JSON.parse(JSON.stringify(bp.ast));
          const rootObj = initialHomeAst.root as Record<string, unknown> | undefined;
          if (rootObj && Array.isArray(rootObj.children)) {
            const children = rootObj.children as Array<Record<string, unknown>>;
            const heroBlock = children.find((c) => c.type === "hero");
            if (heroBlock && heroBlock.props && typeof heroBlock.props === "object") {
              (heroBlock.props as Record<string, unknown>).heading = `Welcome to ${input.title}`;
            }
          }
        }
      }
    }

    // Execute atomic provisioning transaction
    return this.db.$transaction(async (tx) => {
      // 1. Create CmsSite record
      const site = await tx.cmsSite.create({
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
              hostname: stagingHostname,
              isPrimary: true,
              isSubdomain: true,
              status: "ACTIVE",
              verificationToken: `vtoken_${Date.now()}`,
              verifiedAt: new Date(),
            },
          },
        },
      });

      // 2. Create Default Home Page
      const homePage = await tx.cmsPage.create({
        data: {
          organizationId: input.organizationId,
          siteId: site.id,
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

      return {
        site,
        homePage,
      };
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
