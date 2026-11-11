import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EDITOR_ROOT = join(process.cwd(), "src/editor");
const PALETTE_CLASS = /(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|placeholder|accent|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b/;

function editorFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return editorFiles(path);
    }
    return /.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe("Editor design-token discipline", () => {
  it("uses semantic tokens only in the editing surface", () => {
    const violations: string[] = [];
    for (const file of editorFiles(EDITOR_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        if (PALETTE_CLASS.test(line) || RAW_COLOUR.test(line)) {
          violations.push(file + ":" + String(index + 1) + " " + line.trim());
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
