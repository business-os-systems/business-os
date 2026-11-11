import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Performance budget validator (T124, FR-064, SC-009).
 *
 * The budget document and the measured results document are both closed:
 * unknown surfaces, metrics or keys are configuration errors, not warnings.
 * A measured value above its budget exits non-zero, which makes the CI job red.
 */

export const STOREFRONT_METRICS = ["htmlBytes", "jsBytes", "cssBytes", "lcpMs", "tbtMs", "cls"];
export const DASHBOARD_METRICS = ["interactionP95Ms"];
const ALL_METRICS = new Set([...STOREFRONT_METRICS, ...DASHBOARD_METRICS]);
const SURFACE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EPSILON = 1e-9;

const METRIC_UNITS = {
  htmlBytes: "bytes",
  jsBytes: "bytes",
  cssBytes: "bytes",
  lcpMs: "ms",
  tbtMs: "ms",
  cls: "score",
  interactionP95Ms: "ms",
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateMetricValues(metrics, expected, label, errors) {
  if (!isRecord(metrics)) {
    errors.push(label + " must be an object.");
    return;
  }
  const keys = Object.keys(metrics);
  for (const key of keys) {
    if (!expected.includes(key)) {
      errors.push(label + " contains unknown metric '" + key + "'.");
    }
  }
  for (const metric of expected) {
    if (!keys.includes(metric)) {
      errors.push(label + " is missing metric '" + metric + "'.");
      continue;
    }
    const value = metrics[metric];
    if (!isFiniteNumber(value) || value < 0) {
      errors.push(label + "." + metric + " must be a finite non-negative number.");
    }
  }
}

function validateSurface(name, surface, errors) {
  const label = "surfaces." + name;
  if (!SURFACE_NAME.test(name)) {
    errors.push(label + " must be a lowercase kebab-case surface name.");
  }
  if (!isRecord(surface)) {
    errors.push(label + " must be an object.");
    return;
  }
  const allowedKeys = ["kind", "path", "description", "budgets"];
  for (const key of Object.keys(surface)) {
    if (!allowedKeys.includes(key)) {
      errors.push(label + " contains unknown key '" + key + "'.");
    }
  }
  if (surface.kind !== "storefront" && surface.kind !== "dashboard") {
    errors.push(label + ".kind must be 'storefront' or 'dashboard'.");
    return;
  }
  if (typeof surface.path !== "string" || !surface.path.startsWith("/")) {
    errors.push(label + ".path must start with '/'.");
  }
  if (surface.description !== undefined && typeof surface.description !== "string") {
    errors.push(label + ".description must be a string.");
  }
  const expected = surface.kind === "storefront" ? STOREFRONT_METRICS : DASHBOARD_METRICS;
  validateMetricValues(surface.budgets, expected, label + ".budgets", errors);
}

export function validateBudgetDocument(document) {
  const errors = [];
  if (!isRecord(document)) {
    return ["The budget document must be an object."];
  }
  for (const key of Object.keys(document)) {
    if (!["$schema", "version", "updatedAt", "description", "surfaces"].includes(key)) {
      errors.push("Budget document contains unknown key '" + key + "'.");
    }
  }
  if (document.version !== 1) {
    errors.push("version must be 1.");
  }
  if (typeof document.updatedAt !== "string" || Number.isNaN(Date.parse(document.updatedAt))) {
    errors.push("updatedAt must be an ISO date string.");
  }
  if (document.description !== undefined && typeof document.description !== "string") {
    errors.push("description must be a string.");
  }
  if (!isRecord(document.surfaces) || Object.keys(document.surfaces).length === 0) {
    errors.push("surfaces must be a non-empty object.");
    return errors;
  }
  for (const [name, surface] of Object.entries(document.surfaces)) {
    validateSurface(name, surface, errors);
  }
  return errors;
}

export function validateResultsDocument(document, budgetDocument) {
  const errors = [];
  if (!isRecord(document)) {
    return ["The results document must be an object."];
  }
  if (typeof document.generatedAt !== "string" || Number.isNaN(Date.parse(document.generatedAt))) {
    errors.push("generatedAt must be an ISO timestamp.");
  }
  if (!isRecord(document.surfaces)) {
    errors.push("surfaces must be an object.");
    return errors;
  }
  for (const [name, metrics] of Object.entries(document.surfaces)) {
    const surface = budgetDocument.surfaces[name];
    if (surface === undefined) {
      errors.push("surfaces." + name + " has no declared budget.");
      continue;
    }
    const expected = surface.kind === "storefront" ? STOREFRONT_METRICS : DASHBOARD_METRICS;
    validateMetricValues(metrics, expected, "surfaces." + name, errors);
  }
  for (const name of Object.keys(budgetDocument.surfaces)) {
    if (!Object.hasOwn(document.surfaces, name)) {
      errors.push("surfaces." + name + " is missing from the measured results.");
    }
  }
  return errors;
}

export function evaluateResults(budgetDocument, resultsDocument) {
  const violations = [];
  let checked = 0;
  for (const [name, surface] of Object.entries(budgetDocument.surfaces)) {
    const measured = resultsDocument.surfaces[name];
    for (const [metric, budget] of Object.entries(surface.budgets)) {
      const actual = measured[metric];
      checked += 1;
      if (actual > budget + EPSILON) {
        violations.push({
          surface: name,
          metric,
          budget,
          actual,
          unit: METRIC_UNITS[metric],
          excess: actual - budget,
        });
      }
    }
  }
  return { violations, checked };
}

export function formatReport(evaluation) {
  const lines = [];
  lines.push("Performance budget gate");
  lines.push("checked metrics: " + String(evaluation.checked));
  if (evaluation.violations.length === 0) {
    lines.push("result: PASS (every measured value is within its budget)");
    return lines.join("\n");
  }
  lines.push("result: FAIL (" + String(evaluation.violations.length) + " violation(s))");
  for (const violation of evaluation.violations) {
    lines.push(
      "- " + violation.surface + "." + violation.metric + " measured " + String(violation.actual) + " " +
      violation.unit + " against a budget of " + String(violation.budget) + " " + violation.unit
    );
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Arguments must be --name value pairs.");
    }
    if (!["--budgets", "--results", "--report"].includes(key)) {
      throw new Error("Unknown argument " + key + ".");
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeReport(path, report) {
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
}

export function run(argv) {
  const args = parseArgs(argv);
  if (args.budgets === undefined) {
    process.stderr.write("Usage: validate-perf-budgets.mjs --budgets <path> [--results <path>] [--report <path>]\n");
    return 2;
  }
  let budgets;
  try {
    budgets = readJson(args.budgets);
  } catch (error) {
    process.stderr.write("Cannot read the budget document: " + messageOf(error) + "\n");
    return 2;
  }
  const budgetErrors = validateBudgetDocument(budgets);
  if (budgetErrors.length > 0) {
    process.stderr.write("Invalid budget document:\n" + budgetErrors.join("\n") + "\n");
    return 2;
  }
  if (args.results === undefined) {
    process.stdout.write("Budget document is valid (" + String(Object.keys(budgets.surfaces).length) + " surfaces).\n");
    return 0;
  }
  let results;
  try {
    results = readJson(args.results);
  } catch (error) {
    process.stderr.write("Cannot read the results document: " + messageOf(error) + "\n");
    return 2;
  }
  const resultErrors = validateResultsDocument(results, budgets);
  if (resultErrors.length > 0) {
    process.stderr.write("Invalid results document:\n" + resultErrors.join("\n") + "\n");
    return 2;
  }
  const evaluation = evaluateResults(budgets, results);
  const report = {
    checkedAt: new Date().toISOString(),
    budgetsPath: args.budgets,
    resultsPath: args.results,
    passed: evaluation.violations.length === 0,
    checkedMetrics: evaluation.checked,
    violations: evaluation.violations,
  };
  if (args.report !== undefined) {
    writeReport(args.report, report);
  }
  process.stdout.write(formatReport(evaluation) + "\n");
  return evaluation.violations.length === 0 ? 0 : 1;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = run(process.argv.slice(2));
}
