import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateResults,
  validateBudgetDocument,
  validateResultsDocument,
} from "./validate-perf-budgets.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const BUDGETS = join(DIR, "perf-budgets.json");
const CURRENT = join(DIR, "perf-fixtures/current-results.json");
const OVER = join(DIR, "perf-fixtures/over-budget-results.json");
const VALIDATOR = join(DIR, "validate-perf-budgets.mjs");

function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runValidator(resultsPath) {
  return spawnSync(process.execPath, [VALIDATOR, "--budgets", BUDGETS, "--results", resultsPath], {
    encoding: "utf8",
  });
}

test("the declared budgets are a valid, closed document", () => {
  const errors = validateBudgetDocument(read(BUDGETS));
  assert.deepEqual(errors, []);
});

test("current measured values satisfy every declared budget", () => {
  const budgets = read(BUDGETS);
  const results = read(CURRENT);
  assert.deepEqual(validateResultsDocument(results, budgets), []);
  const evaluation = evaluateResults(budgets, results);
  assert.equal(evaluation.violations.length, 0);
  assert.ok(evaluation.checked > 0);
});

test("the validator CLI passes current values", () => {
  const result = runValidator(CURRENT);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /result: PASS/);
});

test("the validator CLI fails on an over-budget sample", () => {
  const result = runValidator(OVER);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /storefront-home\.jsBytes/);
  assert.match(result.stdout, /storefront-home\.lcpMs/);
  assert.match(result.stdout, /dashboard-inquiries\.interactionP95Ms/);
});

test("a missing surface fails closed instead of passing", () => {
  const budgets = read(BUDGETS);
  const results = read(CURRENT);
  delete results.surfaces["storefront-about"];
  const errors = validateResultsDocument(results, budgets);
  assert.ok(errors.some((error) => error.includes("storefront-about")));
});

test("an unknown metric is a configuration error", () => {
  const budgets = read(BUDGETS);
  budgets.surfaces["storefront-home"].budgets.bogusMs = 1;
  const errors = validateBudgetDocument(budgets);
  assert.ok(errors.some((error) => error.includes("bogusMs")));
});
