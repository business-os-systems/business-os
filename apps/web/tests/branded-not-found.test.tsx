import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "../src/app/not-found";
import HoldingPage from "../src/app/holding/page";

describe("branded not-found and holding surfaces (FR-039, FR-110)", () => {
  it("renders an accessible, token-styled not-found without tenant or workspace content", () => {
    const markup = renderToStaticMarkup(<NotFound />);

    expect(markup).toContain("<main");
    expect(markup).toContain("<h1");
    expect(markup).toContain('aria-labelledby="storefront-state-title"');
    expect(markup).toContain("Page not found");
    expect(markup).toContain("var(--bos-surface)");
    expect(markup).toContain("var(--bos-text)");
    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain("/dashboard");
    expect(markup).not.toContain("org_");
  });

  it("renders a neutral holding page that never invites a sign-in", () => {
    const markup = renderToStaticMarkup(<HoldingPage />);

    expect(markup).toContain("This website is not available yet");
    expect(markup).toContain("var(--bos-surface)");
    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain("/login");
  });
});
