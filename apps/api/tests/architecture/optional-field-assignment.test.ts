import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the API services against the field-by-field optional-assignment
 * pattern:
 *
 *   if (input.foo !== undefined) patch.foo = input.foo;
 *
 * Optional update fields belong in one declarative object; Prisma ignores
 * undefined properties. Block-bodied conditionals that build a query filter
 * are a different concern and are not matched.
 */
const SOURCE_ROOTS = [join(process.cwd(), "src")];

const OPTIONAL_ASSIGNMENT =
  /if \([^\n]*!==\s*undefined\)\s*\n\s*(?!\{)[A-Za-z_$][\w$]*(?:\.[\w$]+|\[[^\]]+\])\s*=(?!=)/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("Optional update patches", () => {
  it("are declarative, not field-by-field behind undefined checks", () => {
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).filter((file) =>
      OPTIONAL_ASSIGNMENT.test(readFileSync(file, "utf8"))
    );

    expect(
      offenders.map((file) => file.replace(process.cwd(), "")),
      "Map the optional fields in one object; do not add an if per field. See buildUpdatePatch in flags.service.ts."
    ).toEqual([]);
  });
});
