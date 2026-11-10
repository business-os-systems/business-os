import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const headerState = vi.hoisted(() => ({
  value: null as string | null,
  secret: null as string | null,
}));

process.env.BREAK_GLASS_PROXY_SECRET = "test-break-glass-secret";

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => {
        if (name === "x-break-glass-verified") return headerState.value;
        if (name === "x-break-glass-secret") return headerState.secret;
        return null;
      },
    }),
}));

const { default: BreakGlassPage, metadata } = await import(
  "../../src/app/(auth)/break-glass/page"
);

async function renderPage(): Promise<string> {
  return renderToString(await BreakGlassPage());
}

/** The denial may say what it is, never what the application contains. */
function expectNoApplicationContent(html: string): void {
  expect(html).not.toContain("Break-glass access");
  expect(html).not.toContain("bootstrap-operator");
  expect(html).not.toContain("certificate");
  expect(html).not.toContain("offline key");
  expect(html).not.toContain("admitted");
  expect(html).not.toContain("@");
  expect(html).not.toContain("127.0.0.1");
  expect(html).not.toMatch(/tenant|organization|operator id|workspace/i);
}

describe("generic edge denial page", () => {
  it("denies a request without the proxy admission header", async () => {
    headerState.value = null;
    const html = await renderPage();

    expect(html).toContain("Not available");
    expect(html).toContain("This route is not available.");
    expectNoApplicationContent(html);
  });

  it("denies every non-canonical header value", async () => {
    for (const value of ["", "0", "true", "1 ", "yes"]) {
      headerState.value = value;
      expectNoApplicationContent(await renderPage());
    }
  });

  it("keeps the denial document out of search indexes", () => {
    expect(metadata.title).toBe("Business OS");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("denies the admission flag without the proxy shared secret", async () => {
    headerState.value = "1";
    headerState.secret = null;
    expectNoApplicationContent(await renderPage());

    headerState.secret = "wrong-secret";
    expectNoApplicationContent(await renderPage());
  });

  it("shows the recovery procedure only after the flag and shared secret", async () => {
    headerState.value = "1";
    headerState.secret = "test-break-glass-secret";
    const html = await renderPage();

    expect(html).toContain("Break-glass access");
    expect(html).toContain("bootstrap-operator");
    expect(html).not.toContain("Not available");
  });
});
