import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  evaluateDiff,
  formatReport,
  isIgnoredPath,
  loadBaseline,
  parseLcov,
  parseUnifiedDiff,
  selectRelevantFiles,
  validateBaseRef,
} from "./diff-coverage.mjs";

function newFileDiff(filePath, addedLines) {
  return [
    "diff --git a/" + filePath + " b/" + filePath,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    "+++ b/" + filePath,
    "@@ -0,0 +1," + addedLines.length + " @@",
    ...addedLines.map((text) => "+" + text),
  ].join("\n");
}

function modifiedFileDiff(filePath, header, body) {
  return [
    "diff --git a/" + filePath + " b/" + filePath,
    "index 1111111..2222222 100644",
    "--- a/" + filePath,
    "+++ b/" + filePath,
    header,
    ...body,
  ].join("\n");
}

function lcovFor(entries) {
  return entries
    .map(
      (entry) =>
        "TN:\nSF:" +
        entry.path +
        "\n" +
        entry.lines.map(([line, count]) => "DA:" + line + "," + count).join("\n") +
        "\nend_of_record",
    )
    .join("\n");
}

function coverageFrom(entries) {
  const coverage = new Map();
  for (const entry of entries) {
    coverage.set(entry.path, new Map(entry.lines));
  }
  return coverage;
}

const COVERED_FEATURE = {
  path: "apps/api/src/feature.ts",
  lines: [
    [1, 1],
    [2, 1],
  ],
};

describe("parseUnifiedDiff", () => {
  it("records only added lines from a modified file", () => {
    const diff = modifiedFileDiff("apps/api/src/feature.ts", "@@ -2 +2 @@", ["-old", "+new"]);

    const files = parseUnifiedDiff(diff);

    assert.equal(files.length, 1);
    assert.deepEqual([...files[0].addedLines], [2]);
    assert.equal(files[0].path, "apps/api/src/feature.ts");
  });

  it("keeps added content that starts with +++ inside the hunk", () => {
    const diff = modifiedFileDiff("apps/api/src/feature.ts", "@@ -1 +1,2 @@", [
      "+export const marker = 1;",
      "+++ not a file header",
    ]);

    const files = parseUnifiedDiff(diff);

    assert.deepEqual([...files[0].addedLines], [1, 2]);
    assert.equal(files[0].path, "apps/api/src/feature.ts");
  });

  it("marks a deleted file", () => {
    const diff = [
      "diff --git a/apps/api/src/gone.ts b/apps/api/src/gone.ts",
      "deleted file mode 100644",
      "--- a/apps/api/src/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-one",
      "-two",
    ].join("\n");

    const files = parseUnifiedDiff(diff);

    assert.equal(files[0].status, "deleted");
    assert.equal(files[0].path, null);
  });
});

describe("diff coverage gate", () => {
  it("fails on an added uncovered line", () => {
    const files = selectRelevantFiles(
      parseUnifiedDiff(
        modifiedFileDiff("apps/api/src/feature.ts", "@@ -2 +2 @@", ["-old", "+new"]),
      ),
    );
    const coverage = coverageFrom([
      {
        path: "apps/api/src/feature.ts",
        lines: [
          [1, 1],
          [2, 0],
        ],
      },
    ]);

    const result = evaluateDiff(files, coverage);

    assert.equal(result.ok, false);
    assert.deepEqual(result.uncovered, [{ path: "apps/api/src/feature.ts", line: 2 }]);
  });

  it("passes on an added covered line", () => {
    const files = selectRelevantFiles(
      parseUnifiedDiff(
        modifiedFileDiff("apps/api/src/feature.ts", "@@ -2 +2 @@", ["-old", "+new"]),
      ),
    );

    const result = evaluateDiff(files, coverageFrom([COVERED_FEATURE]));

    assert.equal(result.ok, true);
    assert.deepEqual(result.covered, [{ path: "apps/api/src/feature.ts", line: 2 }]);
  });

  it("ignores pre-existing uncovered lines", () => {
    const files = selectRelevantFiles(
      parseUnifiedDiff(
        modifiedFileDiff("apps/api/src/feature.ts", "@@ -2 +2 @@", ["-old", "+new"]),
      ),
    );
    const coverage = coverageFrom([
      {
        path: "apps/api/src/feature.ts",
        lines: [
          [1, 0],
          [2, 1],
        ],
      },
    ]);

    const result = evaluateDiff(files, coverage);

    assert.equal(result.ok, true);
    assert.equal(result.uncovered.length, 0);
  });

  it("reports a new file with no lcov record instead of passing", () => {
    const files = selectRelevantFiles(
      parseUnifiedDiff(newFileDiff("apps/api/src/new-feature.ts", ["export const value = 1;"])),
    );

    const result = evaluateDiff(files, coverageFrom([COVERED_FEATURE]));

    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, [{ path: "apps/api/src/new-feature.ts", addedLines: [1] }]);
  });

  it("ignores a deleted file", () => {
    const diff = [
      "diff --git a/apps/api/src/gone.ts b/apps/api/src/gone.ts",
      "deleted file mode 100644",
      "--- a/apps/api/src/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-one",
      "-two",
    ].join("\n");

    const files = selectRelevantFiles(parseUnifiedDiff(diff));

    assert.equal(files.length, 0);
    assert.equal(evaluateDiff(files, new Map()).ok, true);
  });

  it("ignores a rename", () => {
    const diff = [
      "diff --git a/apps/api/src/old.ts b/apps/api/src/new.ts",
      "similarity index 90%",
      "rename from apps/api/src/old.ts",
      "rename to apps/api/src/new.ts",
      "index 1111111..2222222 100644",
      "--- a/apps/api/src/old.ts",
      "+++ b/apps/api/src/new.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    const files = selectRelevantFiles(parseUnifiedDiff(diff));

    assert.equal(files.length, 0);
  });

  it("passes on an empty diff", () => {
    const files = selectRelevantFiles(parseUnifiedDiff(""));

    assert.deepEqual(files, []);
    assert.equal(evaluateDiff(files, new Map()).ok, true);
  });
});

describe("path exclusions", () => {
  it("ignores tests, migrations, generated output, config and docs", () => {
    const ignored = [
      "apps/api/tests/feature.test.ts",
      "apps/api/src/feature.spec.ts",
      "packages/db/prisma/schema/migrations/20260101_init/migration.sql",
      "apps/dashboard/.next/server/page.js",
      "packages/core/src/generated/types.ts",
      "eslint.config.mjs",
      "package.json",
      "tooling/quality/diff-coverage.mjs",
      "tooling/eslint-rules/fixtures/flag-status.bad.ts",
      "README.md",
      "apps/api/tsconfig.json",
    ];

    for (const filePath of ignored) {
      assert.equal(isIgnoredPath(filePath), true, filePath + " should be ignored");
    }
  });

  it("keeps application source", () => {
    assert.equal(isIgnoredPath("apps/api/src/feature.ts"), false);
    assert.equal(isIgnoredPath("packages/core/src/clock/index.ts"), false);
  });

  it("ignores repo-root tooling configs and extensionless files", () => {
    const ignored = [
      ".dependency-cruiser.cjs",
      "eslint.config.mjs",
      "next.config.mjs",
      "apps/x/next.config.mjs",
      "apps/dashboard/next.config.mjs",
      "apps/dashboard/tailwind.config.cjs",
      "apps/platform/postcss.config.mjs",
      "packages/ui/tailwind.preset.cjs",
      "packages/auth/.eslintrc.cjs",
      "apps/api/Dockerfile",
      "deploy/platform/Caddyfile",
      "deploy/platform/verify-migrations.sh",
      ".husky/pre-commit",
    ];

    for (const filePath of ignored) {
      assert.equal(isIgnoredPath(filePath), true, filePath + " should be ignored");
    }
  });

  it("still measures genuine .mjs and .cjs source files", () => {
    assert.equal(isIgnoredPath("apps/api/src/feature.mjs"), false);
    assert.equal(isIgnoredPath("packages/core/src/util.mjs"), false);
    assert.equal(isIgnoredPath("packages/redis/src/script.cjs"), false);
  });
});

describe("base ref validation", () => {
  it("accepts an origin ref", () => {
    assert.equal(validateBaseRef("origin/dev"), "origin/dev");
  });

  it("rejects option-like and range-shaping refs", () => {
    assert.throws(() => validateBaseRef("--output=/tmp/x"), /Invalid --base ref/);
    assert.throws(() => validateBaseRef("origin/dev...evil"), /Invalid --base ref/);
    assert.throws(() => validateBaseRef("origin/dev main"), /Invalid --base ref/);
  });
});

describe("lcov parsing and reporting", () => {
  it("maps relative lcov paths to repository-relative files", () => {
    const lcov = lcovFor([{ path: "src/feature.ts", lines: [[1, 1]] }]);

    const records = parseLcov(lcov, "/repo/packages/core", "/repo");

    assert.equal(records.length, 1);
    assert.equal(records[0].path, "packages/core/src/feature.ts");
    assert.equal(records[0].lines.get(1), 1);
  });

  it("rejects a malformed DA count instead of treating it as uncovered", () => {
    const lcov = "TN:\nSF:src/feature.ts\nDA:1,not-a-count\nend_of_record";

    assert.throws(() => parseLcov(lcov, "/repo/packages/core", "/repo"), /Invalid lcov DA record/);
  });

  it("prints every uncovered line and the missing-record section", () => {
    const result = {
      ok: false,
      files: 2,
      covered: [],
      uncovered: [{ path: "apps/api/src/feature.ts", line: 2 }],
      skipped: [],
      missing: [{ path: "apps/api/src/new-feature.ts", addedLines: [1] }],
    };

    const report = formatReport(result, { label: "origin/dev...HEAD" });

    assert.match(report, /apps\/api\/src\/feature\.ts:2/);
    assert.match(report, /NO LCOV RECORD/);
    assert.match(report, /result: FAIL/);
  });
});

function baselineOf(entries, expired = []) {
  return { entries: new Map(Object.entries(entries)), expired };
}

const BASELINE_ENTRY = {
  lines: [2],
  owner: "platform",
  expires: "2099-12-31",
  reason: "moved legacy code with no prior coverage",
};

describe("documented coverage baseline", () => {
  const files = [{ path: "apps/api/src/feature.ts", addedLines: new Set([1, 2]) }];
  const coverage = coverageFrom([
    {
      path: "apps/api/src/feature.ts",
      lines: [
        [1, 1],
        [2, 0],
      ],
    },
  ]);

  it("counts a listed uncovered line as baselined and passes", () => {
    const result = evaluateDiff(files, coverage, baselineOf({ "apps/api/src/feature.ts": BASELINE_ENTRY }));

    assert.equal(result.ok, true);
    assert.equal(result.baselined.length, 1);
    assert.equal(result.uncovered.length, 0);
    assert.equal(result.stale.length, 0);
  });

  it("still fails for an uncovered line that is not listed", () => {
    const result = evaluateDiff(
      files,
      coverage,
      baselineOf({ "apps/api/src/feature.ts": { ...BASELINE_ENTRY, lines: [99] } }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.uncovered.length, 1);
    assert.equal(result.stale.length, 1);
  });

  it("fails when a baseline entry is no longer needed because the line is covered", () => {
    const covered = coverageFrom([{ path: "apps/api/src/feature.ts", lines: [[1, 1], [2, 3]] }]);

    const result = evaluateDiff(files, covered, baselineOf({ "apps/api/src/feature.ts": BASELINE_ENTRY }));

    assert.equal(result.ok, false);
    assert.equal(result.stale[0].reason, "line is now covered");
  });

  it("fails when a baseline line is no longer part of the diff", () => {
    const result = evaluateDiff(
      [{ path: "apps/api/src/feature.ts", addedLines: new Set([1]) }],
      coverage,
      baselineOf({ "apps/api/src/feature.ts": BASELINE_ENTRY }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.stale[0].reason, "line is not part of the diff");
  });

  it("fails when a baseline file is no longer part of the diff", () => {
    const result = evaluateDiff([], new Map(), baselineOf({ "apps/api/src/gone.ts": BASELINE_ENTRY }));

    assert.equal(result.ok, false);
    assert.equal(result.stale[0].reason, "file is not part of the diff");
  });

  it("fails when a baseline entry has expired", () => {
    const result = evaluateDiff(
      files,
      coverage,
      baselineOf({ "apps/api/src/feature.ts": BASELINE_ENTRY }, [{ path: "apps/api/src/feature.ts", expires: "2020-01-01" }]),
    );

    assert.equal(result.ok, false);
  });

  it("reports the baselined and stale sections", () => {
    const result = evaluateDiff(
      files,
      coverageFrom([{ path: "apps/api/src/feature.ts", lines: [[1, 1], [2, 0]] }]),
      baselineOf({ "apps/api/src/other.ts": BASELINE_ENTRY }),
    );

    const report = formatReport(result, { label: "origin/dev...HEAD" });

    assert.match(report, /STALE baseline entries/);
    assert.match(report, /BASELINED|uncovered/);
    assert.match(report, /result: FAIL/);
  });
});

describe("baseline file loading", () => {
  function repositoryWithBaseline(content) {
    const root = mkdtempSync(path.join(tmpdir(), "diff-coverage-"));
    mkdirSync(path.join(root, "tooling/quality"), { recursive: true });
    if (content !== undefined) {
      writeFileSync(path.join(root, "tooling/quality/diff-coverage-baseline.json"), content);
    }
    return root;
  }

  it("returns an empty baseline when the file is absent", () => {
    const baseline = loadBaseline(repositoryWithBaseline(undefined));

    assert.equal(baseline.entries.size, 0);
    assert.equal(baseline.expired.length, 0);
  });

  it("rejects an entry without a rationale", () => {
    const root = repositoryWithBaseline(
      JSON.stringify({ "apps/api/src/feature.ts": { lines: [1], owner: "platform", expires: "2099-01-01" } }),
    );

    assert.throws(() => loadBaseline(root), /reason must be a non-empty string/);
  });

  it("rejects an entry with an invalid expiry date", () => {
    const root = repositoryWithBaseline(
      JSON.stringify({
        "apps/api/src/feature.ts": { lines: [1], owner: "platform", expires: "soon", reason: "moved" },
      }),
    );

    assert.throws(() => loadBaseline(root), /expires must be an ISO date/);
  });

  it("flags an expired entry", () => {
    const root = repositoryWithBaseline(
      JSON.stringify({
        "apps/api/src/feature.ts": { lines: [1], owner: "platform", expires: "2020-01-01", reason: "moved" },
      }),
    );

    const baseline = loadBaseline(root);

    assert.equal(baseline.expired.length, 1);
  });

  it("loads a valid entry", () => {
    const root = repositoryWithBaseline(
      JSON.stringify({
        "apps/api/src/feature.ts": { lines: [4, 5], owner: "platform", expires: "2099-12-31", reason: "moved" },
      }),
    );

    const baseline = loadBaseline(root);

    assert.deepEqual(baseline.entries.get("apps/api/src/feature.ts").lines, [4, 5]);
  });
});
