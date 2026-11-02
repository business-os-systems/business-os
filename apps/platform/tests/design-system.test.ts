import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

function walk(path: string): string[] {
  const absolute = fileURLToPath(new URL(path, import.meta.url));
  return readdirSync(absolute).flatMap((entry) => {
    const child = `${absolute}/${entry}`;
    return statSync(child).isDirectory()
      ? walk(`${path}/${entry}`)
      : [child];
  });
}

describe("Platform design system", () => {
  it("imports the one shared token source and defines no local palette", () => {
    const platformGlobals = read("../src/app/globals.css");
    expect(platformGlobals).toContain('@import "@suite/ui/styles.css"');
    expect(platformGlobals).not.toMatch(/--bos-/);
  });

  it("dashboard imports the same shared source and defines no local palette", () => {
    const dashboardGlobals = read("../../dashboard/src/app/globals.css");
    expect(dashboardGlobals).toContain('@import "@suite/ui/styles.css"');
    expect(dashboardGlobals).not.toMatch(/--bos-/);
  });

  it("keeps fonts, light and dark tokens in the shared source", () => {
    const shared = read("../../../packages/ui/src/styles/design-system.css");
    expect(shared).toContain("--bos-font-sans");
    expect(shared).toContain("--bos-font-mono");
    expect(shared).toContain(':root[data-theme="dark"]');
    expect(shared).toContain("--bos-brand");
  });

  it("has no local palette, raw colors or tenant shell imports", () => {
    const files = walk("../src").filter((file) =>
      /\.(ts|tsx|css)$/.test(file)
    );
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/--bos-/);
      expect(content, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(content, file).not.toMatch(
        /\b(?:text|bg|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
      );
      expect(content, file).not.toMatch(
        /(?:DashboardShell|SidebarNav|WorkspaceSwitcher|buildNavigationConfig)/
      );
    }
    expect(
      existsSync(
        fileURLToPath(new URL("../src/components/layout/theme-toggle.tsx", import.meta.url))
      )
    ).toBe(false);
  });

  it("uses the shared Tailwind preset", () => {
    const config = read("../tailwind.config.cjs");
    expect(config).toContain("packages/ui/tailwind.preset.cjs");
  });
});
