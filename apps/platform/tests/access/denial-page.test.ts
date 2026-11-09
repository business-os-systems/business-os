import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const headerState = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) =>
        name === "x-break-glass-verified" ? headerState.value : null,
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

  it("shows the recovery procedure only after the exact admission value", async () => {
    headerState.value = "1";
    const html = await renderPage();

    expect(html).toContain("Break-glass access");
    expect(html).toContain("bootstrap-operator");
    expect(html).not.toContain("Not available");
  });
});
