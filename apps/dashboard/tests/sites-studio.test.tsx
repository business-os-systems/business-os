import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PERMISSIONS } from "@suite/core";
import { CreateSiteWizard } from "../src/components/sites/create-site-wizard";
import {
  SITE_WIZARD_STEP_ORDER,
  createSiteTemplateConfig,
} from "../src/components/sites/create-site-wizard.config";
import { StudioShell } from "../src/components/studio/studio-shell";
import {
  CmsApiError,
  createSiteRequest,
  type CmsPageDto,
  type CmsSiteDto,
  type CmsTemplateDto,
} from "../src/lib/api/site-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const NOW = "2026-11-11T00:00:00.000Z";
const SITE_ID = "site_river";

const SITE: CmsSiteDto = {
  id: SITE_ID,
  organizationId: "org_1",
  branchId: null,
  title: "Riverview Bistro",
  slug: "riverview-bistro",
  status: "DRAFT",
  timezone: "Asia/Kolkata",
  primaryLocale: "en",
  pagesCount: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

const HOME_PAGE: CmsPageDto = {
  id: "page_home",
  siteId: SITE_ID,
  parentId: null,
  title: "Home",
  path: "/",
  orderIndex: 0,
  status: "DRAFT",
  isHomePage: true,
  revision: 3,
  createdAt: NOW,
  updatedAt: NOW,
};

const MENU_PAGE: CmsPageDto = {
  id: "page_menu",
  siteId: SITE_ID,
  parentId: null,
  title: "Menu",
  path: "/menu",
  orderIndex: 1,
  status: "DRAFT",
  isHomePage: false,
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const PAGES: CmsPageDto[] = [HOME_PAGE, MENU_PAGE];

const TEMPLATES: CmsTemplateDto[] = [
  {
    id: "tpl_bistro",
    name: "Bistro starter",
    slug: "bistro-starter",
    category: "hospitality",
    industries: ["hospitality"],
    currentVersion: 2,
    previewRef: null,
  },
];

const noop = vi.fn(() => Promise.resolve());

function renderStudio(canWrite = true): string {
  return renderToString(
    <StudioShell
      site={SITE}
      sites={[SITE]}
      pages={PAGES}
      activePage={MENU_PAGE}
      canWrite={canWrite}
      userPermissions={[PERMISSIONS.WILDCARD]}
      currentUserId="usr_studio"
      currentUserName="Studio Editor"
      onSelectPage={vi.fn()}
      onCreatePage={noop}
      onRenamePage={noop}
      onReorderPage={noop}
      onDuplicatePage={noop}
      onArchivePage={noop}
      onSwitchSite={vi.fn()}
    />
  );
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Create-site wizard (T061)", () => {
  it("renders the name step and the three-step tracker", () => {
    const html = renderToString(
      <CreateSiteWizard domainRoot="example.test" templates={TEMPLATES} templatesError={null} />
    );
    expect(html).toContain("Create a website");
    expect(html).toContain("Site name");
    expect(html).toContain("Continue");
    expect(SITE_WIZARD_STEP_ORDER).toEqual(["name", "address", "template"]);
    expect(html).toContain("Address");
    expect(html).toContain("Template");
  });

  it("builds a template step with published options and a blank option", () => {
    const field = createSiteTemplateConfig(TEMPLATES).sections[0]?.fields?.[0];
    expect(field?.type).toBe("select");
    if (field?.type === "select") {
      expect(field.options).toEqual([
        { label: "Blank site", value: "" },
        { label: "Bistro starter (hospitality)", value: "tpl_bistro" },
      ]);
    }
    const emptyField = createSiteTemplateConfig([]).sections[0]?.fields?.[0];
    if (emptyField?.type === "select") {
      expect(emptyField.options).toEqual([{ label: "Blank site", value: "" }]);
    }
  });

  it("surfaces templates errors verbatim", () => {
    const html = renderToString(
      <CreateSiteWizard
        domainRoot="example.test"
        templates={[]}
        templatesError="The template catalog is unavailable."
      />
    );
    expect(html).toContain("The template catalog is unavailable.");
  });
});

describe("Create-site request", () => {
  it("posts once with an idempotency key and returns the home page", async () => {
    const captured: { headers: Headers | null } = { headers: null };
    vi.stubGlobal(
      "fetch",
      vi.fn((...args: [RequestInfo | URL, RequestInit?]) => {
        captured.headers = new Headers(args[1]?.headers);
        return jsonResponse(
          {
            success: true,
            data: {
              site: SITE,
              homePage: { id: "page_home", title: "Home", path: "/" },
              pageCount: 2,
              replayed: false,
            },
            requestId: "req_1",
            timestamp: NOW,
          },
          201
        );
      })
    );
    const result = await createSiteRequest(
      { title: "Riverview Bistro", slug: "riverview-bistro", templateId: "tpl_bistro" },
      "idem-wizard-1"
    );
    expect(result.homePage.id).toBe("page_home");
    expect(captured.headers?.get("Idempotency-Key")).toBe("idem-wizard-1");
  });
});

describe("Create-site problem details", () => {
  it("shows RFC 7807 validation details from the API verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(
          {
            type: "/errors/reserved-slug",
            title: "Reserved Site Address",
            status: 422,
            detail: "The site address is reserved by the platform.",
            code: "RESERVED_SLUG",
            invalidParams: [{ name: "slug", reason: "Choose a different subdomain label." }],
            timestamp: NOW,
          },
          422
        )
      )
    );
    const error = await createSiteRequest(
      { title: "Site", slug: "dashboard", templateId: null },
      "idem-wizard-2"
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CmsApiError);
    expect(error).toMatchObject({
      problem: {
        detail: "The site address is reserved by the platform.",
        invalidParams: [{ name: "slug", reason: "Choose a different subdomain label." }],
      },
    });
  });
});

describe("Studio shell (T064)", () => {
  it("renders the page tree, canvas and inspector regions", () => {
    const html = renderStudio();
    expect(html).toContain('aria-label="Page tree"');
    expect(html).toContain('role="region" aria-label="Canvas"');
    expect(html).toContain('role="region" aria-label="Inspector"');
    expect(html).toContain("Home");
    expect(html).toContain("Menu");
    expect(html).toContain("Loading the editor...");
  });

  it("marks the deep-linked page active and links the site-level surfaces", () => {
    const html = renderStudio();
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Exit studio");
    expect(html).toContain("Site settings");
    expect(html).toContain("Domains");
    expect(html).toContain("Appearance");
    expect(html).toContain("Enquiries");
    expect(html).toContain("Redirects");
    expect(html).toContain("href=\"/dashboard/sites/" + SITE_ID + "/settings\"");
  });

  it("hides tree write controls for a read-only session", () => {
    expect(renderStudio(false)).not.toContain("Add page");
  });

  it("renders exactly one top bar with context, device, preview, review and appearance", () => {
    const html = renderStudio();
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html.match(/data-studio-topbar/g)).toHaveLength(1);
    expect(html).toContain('for="studio-site-switcher"');
    expect(html).toContain('aria-label="Device viewport"');
    expect(html).toContain("Preview");
    expect(html).toContain("Review &amp; publish");
    expect(html).toContain("Appearance");
  });

  it("keeps the site-level destinations inside the studio navigation", () => {
    const html = renderStudio();
    expect(html).toContain('aria-label="Site settings"');
    for (const segment of ["settings", "domains", "inquiries", "redirects"]) {
      expect(html).toContain('href="/dashboard/sites/' + SITE_ID + "/" + segment + '"');
    }
  });
});
