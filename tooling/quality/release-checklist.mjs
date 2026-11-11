import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Release checklist artifact (T124/T125, FR-063/FR-064, SC-017).
 *
 * Reads the Playwright evidence and the budget report, then writes one
 * machine-readable and one human-readable artifact. Missing evidence fails
 * closed: an absent a11y scan is not a pass.
 */

const REQUIRED_SURFACES = [
  "storefront-home",
  "storefront-about",
  "storefront-contact",
  "storefront-not-found",
  "dashboard-studio",
  "dashboard-review",
  "dashboard-inquiries",
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Arguments must be --name value pairs.");
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function evaluateA11y(records) {
  const surfaces = records.filter((record) => record.kind === "a11y");
  const scanned = new Map(surfaces.map((record) => [record.surface, record]));
  const missing = REQUIRED_SURFACES.filter((surface) => !scanned.has(surface));
  const failing = Array.from(scanned.values())
    .filter((record) => record.surface !== "known-violation-fixture" && record.violationCount !== 0)
    .map((record) => ({ surface: record.surface, violations: record.violationCount, ids: record.violationIds }));
  return {
    passed: missing.length === 0 && failing.length === 0,
    scanned: surfaces.length,
    missing,
    failing,
    tenantSurfaces: REQUIRED_SURFACES.map((surface) => {
      const record = scanned.get(surface);
      return {
        surface,
        url: record?.url ?? null,
        violations: record?.violationCount ?? null,
        scannedAt: record?.capturedAt ?? null,
      };
    }),
  };
}

function buildMarkdown(checklist) {
  const lines = [];
  lines.push("# Website Builder release checklist — accessibility and performance");
  lines.push("");
  lines.push("Generated: " + checklist.generatedAt);
  lines.push("Commit: " + checklist.commit);
  lines.push("Result: " + (checklist.passed ? "PASS" : "FAIL"));
  lines.push("");
  lines.push("## Accessibility (axe WCAG 2.1 A/AA)");
  lines.push("");
  lines.push("| Surface | URL | Violations | Link |");
  lines.push("| --- | --- | --- | --- |");
  for (const surface of checklist.a11y.tenantSurfaces) {
    lines.push(
      "| " + surface.surface + " | " + (surface.url ?? "missing") + " | " +
      (surface.violations === null ? "not scanned" : String(surface.violations)) + " | " +
      (surface.scannedAt === null ? "—" : "recorded") + " |"
    );
  }
  if (checklist.a11y.missing.length > 0) {
    lines.push("");
    lines.push("Missing scans: " + checklist.a11y.missing.join(", "));
  }
  lines.push("");
  lines.push("## Performance budgets");
  lines.push("");
  lines.push("Checked metrics: " + String(checklist.performance.checkedMetrics));
  lines.push("Result: " + (checklist.performance.passed ? "PASS" : "FAIL"));
  if (checklist.performance.violations.length > 0) {
    lines.push("");
    lines.push("| Surface | Metric | Budget | Measured |");
    lines.push("| --- | --- | --- | --- |");
    for (const violation of checklist.performance.violations) {
      lines.push(
        "| " + violation.surface + " | " + violation.metric + " | " + String(violation.budget) +
        " " + violation.unit + " | " + String(violation.actual) + " " + violation.unit + " |"
      );
    }
  }
  lines.push("");
  lines.push("## Release rule");
  lines.push("");
  lines.push("A single accessibility violation or a single over-budget metric makes this checklist FAIL and the CI job red. Do not publish a release from a failing checklist.");
  return lines.join("\n");
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.a11y === undefined || args["perf-report"] === undefined || args.output === undefined) {
    process.stderr.write("Usage: release-checklist.mjs --a11y <path> --perf-report <path> --output <path> [--json <path>]\n");
    return 2;
  }
  const a11y = evaluateA11y(readJson(args.a11y));
  const perf = readJson(args["perf-report"]);
  const checklist = {
    generatedAt: new Date().toISOString(),
    commit: args.commit ?? "local",
    passed: a11y.passed && perf.passed === true,
    a11y,
    performance: {
      passed: perf.passed === true,
      checkedMetrics: perf.checkedMetrics,
      violations: perf.violations,
    },
  };
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, buildMarkdown(checklist) + "\n");
  if (args.json !== undefined) {
    writeFileSync(args.json, JSON.stringify(checklist, null, 2) + "\n");
  } else {
    writeFileSync(args.output.replace(/\.md$/, ".json"), JSON.stringify(checklist, null, 2) + "\n");
  }
  process.stdout.write(buildMarkdown(checklist) + "\n");
  return checklist.passed ? 0 : 1;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = main(process.argv.slice(2));
}
