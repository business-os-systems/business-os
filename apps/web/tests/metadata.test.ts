import { describe, expect, it } from "vitest";
import {
  buildCanonicalUrl,
  publishedPageResponse,
  publishedSiteResponse,
} from "../src/lib/storefront/pages";

const ORIGIN = "https://acme.businessos.app";

const SITE = {
  title: "River View Bistro",
  homePath: "/",
  defaultLocale: "en",
  homePage: {
    path: "/about",
    title: '<script>alert("seo")</script>',
    description: 'A <b>description</b> & "quotes"',
    keywords: ["rooms"],
    ogImageUrl: "javascript:alert(1)",
  },
};

describe("page metadata rendering (FR-041)", () => {
  it("escapes every published SEO field instead of injecting raw HTML", () => {
    const response = publishedSiteResponse(SITE, ORIGIN);
    const body = response.body;

    expect(body).toContain("<title>&lt;script&gt;alert(&quot;seo&quot;)&lt;/script&gt;</title>");
    expect(body).toContain('content="A &lt;b&gt;description&lt;/b&gt; &amp; &quot;quotes&quot;"');
    expect(body).not.toContain("<script>alert");
    expect(body).not.toContain("javascript:");
    expect(body).toContain('rel="canonical" href="' + ORIGIN + '/about"');
    expect(body).toContain('<meta property="og:type" content="website">');
  });

  it("renders a non-home page's own canonical and title", () => {
    const response = publishedPageResponse(
      { ...SITE, homePage: null },
      {
        path: "/rates",
        title: "Rates",
        description: "Nightly rates",
        keywords: [],
        ogImageUrl: null,
      },
      ORIGIN
    );

    expect(response.body).toContain("<title>Rates</title>");
    expect(response.body).toContain('rel="canonical" href="' + ORIGIN + '/rates"');
  });

  it("refuses a canonical path that would leave the tenant origin", () => {
    expect(buildCanonicalUrl(ORIGIN, "//victim.example/x")).toBeNull();
    expect(buildCanonicalUrl(ORIGIN, "/about")).toBe(ORIGIN + "/about");
  });

  it("keeps the published cache and host key on the response", () => {
    const response = publishedSiteResponse(SITE, ORIGIN);

    expect(response.headers.Vary).toBe("Host");
    expect(response.headers["Cache-Control"]).toContain("s-maxage=3600");
  });
});
