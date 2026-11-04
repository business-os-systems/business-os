import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(process.cwd(), "src");
const SCOPED_FILES = [
  join(SOURCE_ROOT, "routes", "admin"),
  join(SOURCE_ROOT, "services", "admin", "tenant-view.service.ts"),
  join(SOURCE_ROOT, "services", "admin", "tenant.service.ts"),
  join(SOURCE_ROOT, "services", "admin", "tenant-record.service.ts"),
];

const FORBIDDEN_PATTERNS = [
  {
    pattern: /code:\s*"[A-Z][A-Z0-9_]{2,}"/g,
    hint: "use PLATFORM_ERROR_CODE.* (or AUTH_ERROR_CODES.*) instead of a literal",
  },
  {
    pattern: /"platform:[a-z]+:[a-z]+"/g,
    hint: "use PLATFORM_CAPABILITIES.* instead of a literal",
  },
];

function collectFiles(path: string): string[] {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (stats === undefined) {
    return [];
  }
  if (stats.isFile()) {
    return path.endsWith(".ts") ? [path] : [];
  }
  return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)));
}

describe("Platform admin code references canonical constants (CT-6)", () => {
  it("contains no raw error-code or capability literals", () => {
    const violations: string[] = [];

    for (const file of SCOPED_FILES.flatMap(collectFiles)) {
      const content = readFileSync(file, "utf8");
      for (const rule of FORBIDDEN_PATTERNS) {
        for (const match of content.matchAll(rule.pattern)) {
          violations.push(
            `${relative(process.cwd(), file)} -> ${match[0]}: ${rule.hint}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
