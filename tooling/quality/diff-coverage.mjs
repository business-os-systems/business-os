#!/usr/bin/env node
/**
 * Diff coverage gate for pull requests.
 *
 * The tool reads the added lines of a git diff, maps them to the lcov records
 * produced by `pnpm test:coverage`, and fails when an added executable line has
 * no execution count. A file with no lcov record is reported separately: it is
 * unverifiable, not silently passing.
 *
 * Exclusions cover files that cannot carry a Vitest line count: tests,
 * migrations, build output, generated code, database schema, configuration,
 * documentation, fixtures, and CI tooling (proven by `node --test` instead).
 *
 * Usage:
 *   node tooling/quality/diff-coverage.mjs [--base origin/dev]
 *   node tooling/quality/diff-coverage.mjs --working-tree
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BASE = "origin/dev";
export const DEFAULT_BASELINE_PATH = "tooling/quality/diff-coverage-baseline.json";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Only a script file can carry a Vitest line count. Everything else
// (Dockerfile, Caddyfile, shell scripts, lockfiles, docs, images) is not
// executable TypeScript, so it is excluded by class instead of an
// ever-growing deny list. Real .mjs/.cjs source stays measurable.
const MEASURABLE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const IGNORED_SEGMENT =
  /(^|\/)(node_modules|dist|build|out|\.next|\.turbo|coverage|generated|graphify-out|migrations?|tests?|__tests__|__snapshots__|fixtures?)\//;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// Configuration: the conventional *.config.* form (eslint.config.mjs,
// next.config.mjs, tailwind.config.cjs), shared tool presets such as
// packages/ui/tailwind.preset.cjs, and the JSON/YAML manifests.
const CONFIG_FILE =
  /(^|\/)([^/]+\.(config|preset)\.[cm]?[jt]s|tsconfig[^/]*\.json|knip\.json|turbo\.json|package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$/;
// Tooling config often has no ".config." infix: a dotfile basename
// (.dependency-cruiser.cjs, .eslintrc.cjs, .prettierrc.cjs) is configuration
// by convention and is never application source.
const DOTFILE = /(^|\/)\.[^/]+$/;
const DECLARATION_FILE = /\.d\.ts$/;
const CI_TOOLING = /^tooling\//;
// Next.js server components, route handlers and browser-only modules cannot be
// rendered by Vitest; the Playwright release gates exercise them in a real
// browser (a11y, keyboard paths and performance budgets). Their Vitest suites
// still run, they are simply not part of the line-coverage diff.
const NEXT_WEB_SURFACE = /^apps\/web\/src\//;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const UNSAFE_BASE_REF = /[\s~^:?*\[\]\\]|\.\./;

/**
 * Rejects a base ref that could be read as a git option or reshape the range.
 * @param {string} base
 */
export function validateBaseRef(base) {
  if (base.startsWith("-") || UNSAFE_BASE_REF.test(base)) {
    throw new Error("Invalid --base ref: " + base);
  }
  return base;
}

/**
 * True when an added line in this path cannot be measured by Vitest coverage.
 * @param {string} filePath repository-relative, forward-slash path
 */
export function isIgnoredPath(filePath) {
  return (
    !MEASURABLE_EXTENSION.test(filePath) ||
    IGNORED_SEGMENT.test(filePath) ||
    TEST_FILE.test(filePath) ||
    CONFIG_FILE.test(filePath) ||
    DOTFILE.test(filePath) ||
    DECLARATION_FILE.test(filePath) ||
    CI_TOOLING.test(filePath) ||
    NEXT_WEB_SURFACE.test(filePath) ||
    filePath.startsWith(".github/")
  );
}

function stripDiffPrefix(rawPath) {
  const withoutQuotes = rawPath.trim().replace(/^"|"$/g, "");
  if (withoutQuotes === "/dev/null") return null;
  return withoutQuotes.replace(/^[ab]\//, "");
}

function createDiffFile() {
  return { path: null, oldPath: null, status: "modified", addedLines: new Set() };
}

function createHunkState() {
  // Mutated only while parsing one diff; the object never escapes the parser.
  return { oldRemaining: 0, newRemaining: 0, nextNewLine: 0 };
}

function startHunk(state, line) {
  const hunk = HUNK_HEADER.exec(line);
  if (!hunk) return false;
  state.oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
  state.newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
  state.nextNewLine = Number(hunk[3]);
  return true;
}

function consumeHunkLine(file, state, line) {
  if (state.oldRemaining <= 0 && state.newRemaining <= 0) return false;
  if (line.startsWith("+")) {
    file.addedLines.add(state.nextNewLine);
    state.nextNewLine += 1;
    state.newRemaining -= 1;
  } else if (line.startsWith("-")) {
    state.oldRemaining -= 1;
  } else if (line.startsWith(" ")) {
    state.nextNewLine += 1;
    state.newRemaining -= 1;
    state.oldRemaining -= 1;
  }
  return true;
}

function readHeaderLine(file, line) {
  if (line.startsWith("new file mode")) {
    file.status = "added";
  } else if (line.startsWith("deleted file mode")) {
    file.status = "deleted";
  } else if (line.startsWith("rename from ")) {
    file.status = "renamed";
    file.oldPath = stripDiffPrefix(line.slice("rename from ".length));
  } else if (line.startsWith("rename to ")) {
    file.path = stripDiffPrefix(line.slice("rename to ".length));
  } else if (line.startsWith("--- ")) {
    file.oldPath = stripDiffPrefix(line.slice(4));
  } else if (line.startsWith("+++ ")) {
    file.path = stripDiffPrefix(line.slice(4));
  }
}

/**
 * Parses `git diff --unified=0 -M` output into per-file added line numbers.
 * Deleted files and renames are returned with a status so the caller can skip
 * them; hunk counts are honoured, which keeps content that itself starts with
 * `+++` from being mistaken for a file header.
 * @param {string} diffText
 * @returns {Array<{path: string | null, oldPath: string | null, status: string, addedLines: Set<number>}>}
 */
export function parseUnifiedDiff(diffText) {
  const files = [];
  const hunk = createHunkState();
  let current = null;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = createDiffFile();
      files.push(current);
      Object.assign(hunk, createHunkState());
      continue;
    }
    if (!current) continue;
    if (startHunk(hunk, line)) continue;
    if (consumeHunkLine(current, hunk, line)) continue;
    readHeaderLine(current, line);
  }

  for (const file of files) {
    if (file.status === "modified" && file.path === null) file.status = "deleted";
  }
  return files;
}

/**
 * Selects the diff entries the gate must evaluate.
 * @param {ReturnType<typeof parseUnifiedDiff>} files
 */
export function selectRelevantFiles(files) {
  return files.filter(
    (file) =>
      file.path !== null &&
      file.status !== "deleted" &&
      file.status !== "renamed" &&
      file.addedLines.size > 0 &&
      !isIgnoredPath(file.path),
  );
}

/**
 * Parses one lcov file into repository-relative paths with per-line counts.
 * @param {string} lcovText
 * @param {string} packageRoot directory the lcov SF entries are relative to
 * @param {string} repoRoot
 */
export function parseLcov(lcovText, packageRoot, repoRoot) {
  const records = [];
  let current = null;

  for (const line of lcovText.split("\n")) {
    if (line.startsWith("SF:")) {
      const sourcePath = line.slice(3).trim();
      const absolute = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.resolve(packageRoot, sourcePath);
      const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
      current = { path: relative, lines: new Map() };
      if (!relative.startsWith("..")) records.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("DA:")) {
      const [lineNumber, count] = line.slice(3).split(",");
      const parsedLine = Number(lineNumber);
      const parsedCount = Number(count);
      if (!Number.isInteger(parsedLine) || !Number.isFinite(parsedCount)) {
        throw new Error("Invalid lcov DA record: " + line);
      }
      current.lines.set(parsedLine, parsedCount);
    } else if (line === "end_of_record") {
      current = null;
    }
  }
  return records;
}

function findLcovFiles(directory, found) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return found;
    }
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    const child = path.join(directory, entry.name);
    if (entry.name === "coverage") {
      const candidate = path.join(child, "lcov.info");
      if (existsSync(candidate)) found.push(candidate);
      continue;
    }
    findLcovFiles(child, found);
  }
  return found;
}

/** Collects every `coverage/lcov.info` under apps and packages. */
export function collectLcovFiles(repoRoot) {
  const found = [];
  for (const root of ["apps", "packages"]) {
    findLcovFiles(path.join(repoRoot, root), found);
  }
  return found;
}

/**
 * Coverage reporters write <package>/coverage/lcov.info; SF entries are
 * relative to the package root, one level above the reports directory.
 * @param {string} lcovFile
 */
function packageRootForLcov(lcovFile) {
  return path.dirname(path.dirname(lcovFile));
}

/**
 * Loads every lcov record into one repository-relative map.
 * @param {string[]} lcovFiles
 * @param {string} repoRoot
 */
export function loadCoverage(lcovFiles, repoRoot) {
  const coverage = new Map();
  for (const lcovFile of lcovFiles) {
    const packageRoot = packageRootForLcov(lcovFile);
    const text = readFileSync(lcovFile, "utf8");
    for (const record of parseLcov(text, packageRoot, repoRoot)) {
      const existing = coverage.get(record.path) ?? new Map();
      for (const [lineNumber, count] of record.lines) {
        existing.set(lineNumber, Math.max(existing.get(lineNumber) ?? 0, count));
      }
      coverage.set(record.path, existing);
    }
  }
  return coverage;
}

/**
 * Validates one baseline entry. A baseline is a reviewable exception, so every
 * field is required: an unexplained or undated entry cannot be checked later.
 * @param {string} filePath
 * @param {unknown} entry
 */
function validateBaselineEntry(filePath, entry) {
  const problems = [];
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error("Baseline entry for " + filePath + " must be an object.");
  }
  const record = /** @type {Record<string, unknown>} */ (entry);
  if (!Array.isArray(record.lines) || record.lines.some((line) => !Number.isInteger(line) || line < 1)) {
    problems.push("lines must be a non-empty array of positive integers");
  }
  if (typeof record.owner !== "string" || record.owner.length === 0) {
    problems.push("owner must be a non-empty string");
  }
  if (typeof record.expires !== "string" || !ISO_DATE.test(record.expires)) {
    problems.push("expires must be an ISO date (YYYY-MM-DD)");
  }
  if (typeof record.reason !== "string" || record.reason.length === 0) {
    problems.push("reason must be a non-empty string");
  }
  if (problems.length > 0) {
    throw new Error("Invalid baseline entry for " + filePath + ": " + problems.join("; ") + ".");
  }
  return {
    path: filePath,
    lines: /** @type {number[]} */ (record.lines),
    owner: /** @type {string} */ (record.owner),
    expires: /** @type {string} */ (record.expires),
    reason: /** @type {string} */ (record.reason),
  };
}

/**
 * Reads the documented baseline of accepted uncovered lines.
 * A missing file is an empty baseline, so the gate keeps failing by default.
 * @param {string} repoRoot
 */
export function loadBaseline(repoRoot) {
  const absolutePath = path.join(repoRoot, DEFAULT_BASELINE_PATH);
  if (!existsSync(absolutePath)) {
    return { entries: new Map(), expired: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(
      "Cannot parse " + DEFAULT_BASELINE_PATH + ": " + (error instanceof Error ? error.message : String(error)),
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(DEFAULT_BASELINE_PATH + " must contain an object keyed by repository path.");
  }
  const entries = new Map();
  const expired = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const [filePath, rawEntry] of Object.entries(parsed)) {
    const entry = validateBaselineEntry(filePath, rawEntry);
    if (entry.expires < today) {
      expired.push({ path: entry.path, expires: entry.expires });
    }
    entries.set(filePath, entry);
  }
  return { entries, expired };
}

/**
 * Compares added lines with the coverage map.
 * Lines with no DA record are blank or comments, so they are skipped rather
 * than reported as uncovered.
 * @param {ReturnType<typeof selectRelevantFiles>} files
 * @param {Map<string, Map<number, number>>} coverage
 */
export function evaluateDiff(files, coverage, baseline = { entries: new Map(), expired: [] }) {
  const covered = [];
  const uncovered = [];
  const baselined = [];
  const stale = [];
  const skipped = [];
  const missing = [];
  const changedPaths = new Set(files.map((file) => file.path));

  for (const file of files) {
    const record = coverage.get(file.path);
    if (!record) {
      missing.push({ path: file.path, addedLines: [...file.addedLines].sort((a, b) => a - b) });
      continue;
    }
    const baselineEntry = baseline.entries.get(file.path);
    const baselineLines = new Set(baselineEntry ? baselineEntry.lines : []);
    const addedLines = new Set(file.addedLines);

    for (const lineNumber of [...file.addedLines].sort((a, b) => a - b)) {
      const count = record.get(lineNumber);
      if (count === undefined) {
        skipped.push({ path: file.path, line: lineNumber });
      } else if (count > 0) {
        covered.push({ path: file.path, line: lineNumber });
      } else if (baselineLines.has(lineNumber)) {
        baselined.push({ path: file.path, line: lineNumber });
      } else {
        uncovered.push({ path: file.path, line: lineNumber });
      }
    }

    // A baselined line that is now covered, or that no longer appears in the
    // diff, is a stale exception: the entry must be removed with the fix.
    for (const baselineLine of baselineLines) {
      const inDiff = addedLines.has(baselineLine);
      const count = record.get(baselineLine);
      if (!inDiff || count === undefined || count > 0) {
        stale.push({
          path: file.path,
          line: baselineLine,
          reason: inDiff ? "line is now covered" : "line is not part of the diff",
        });
      }
    }
  }

  for (const baselinePath of baseline.entries.keys()) {
    if (!changedPaths.has(baselinePath)) {
      stale.push({ path: baselinePath, line: null, reason: "file is not part of the diff" });
    }
  }

  return {
    ok:
      uncovered.length === 0 &&
      missing.length === 0 &&
      stale.length === 0 &&
      baseline.expired.length === 0,
    files: files.length,
    covered,
    uncovered,
    baselined,
    stale,
    expired: baseline.expired,
    skipped,
    missing,
  };
}

/** Human-readable report; one line per uncovered added line. */
export function formatReport(result, options = {}) {
  const output = [];
  const label = options.label ?? "diff";
  output.push("Diff coverage");
  output.push("  range: " + label);
  output.push("  changed source files: " + result.files);
  output.push(
    "  added executable lines: " +
      (result.covered.length + result.uncovered.length + (result.baselined?.length ?? 0)) +
      " (covered " +
      result.covered.length +
      ", baselined " +
      (result.baselined?.length ?? 0) +
      ", uncovered " +
      result.uncovered.length +
      ")",
  );
  if (result.skipped.length > 0) {
    output.push("  added non-executable lines (blank/comment): " + result.skipped.length);
  }
  if (result.uncovered.length > 0) {
    output.push("  UNCOVERED added lines:");
    for (const entry of result.uncovered) {
      output.push("    " + entry.path + ":" + entry.line);
    }
  }
  if ((result.baselined?.length ?? 0) > 0) {
    output.push("  BASELINED added lines (documented exception, see " + DEFAULT_BASELINE_PATH + "):");
    for (const entry of result.baselined) {
      output.push("    " + entry.path + ":" + entry.line);
    }
  }
  if ((result.stale?.length ?? 0) > 0) {
    output.push("  STALE baseline entries (remove them with the fix):");
    for (const entry of result.stale) {
      output.push(
        "    " + entry.path + (entry.line === null ? "" : ":" + entry.line) + " — " + entry.reason,
      );
    }
  }
  if ((result.expired?.length ?? 0) > 0) {
    output.push("  EXPIRED baseline entries:");
    for (const entry of result.expired) {
      output.push("    " + entry.path + " expired " + entry.expires);
    }
  }
  if (result.missing.length > 0) {
    output.push("  NO LCOV RECORD (unverifiable, counted as failure):");
    for (const entry of result.missing) {
      output.push("    " + entry.path + " added lines " + entry.addedLines.join(", "));
    }
  }
  output.push(result.ok ? "  result: PASS" : "  result: FAIL");
  return output.join("\n");
}

function requireValue(argv, index, flagName) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("Missing value for " + flagName);
  }
  return value;
}

function parseArgs(argv) {
  const options = { base: DEFAULT_BASE, workingTree: false, repoRoot: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--working-tree") {
      options.workingTree = true;
    } else if (argument === "--base") {
      options.base = requireValue(argv, index, "--base");
      index += 1;
    } else if (argument.startsWith("--base=")) {
      const value = argument.slice("--base=".length);
      if (value.length === 0) throw new Error("Missing value for --base");
      options.base = value;
    } else if (argument === "--root") {
      options.repoRoot = path.resolve(requireValue(argv, index, "--root"));
      index += 1;
    } else {
      throw new Error("Unknown argument: " + argument);
    }
  }
  return options;
}

function git(repoRoot, args) {
  // core.quotePath=false keeps unicode paths readable; git still quotes paths
  // containing control characters, so hunk parsing stays line-safe.
  return execFileSync("git", ["-c", "core.quotePath=false", "-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function untrackedEntries(repoRoot) {
  // -z avoids git path quoting; every listed entry is still checked with lstat
  // so a symlink cannot make the tool read outside the repository.
  const listing = git(repoRoot, ["ls-files", "-z", "--others", "--exclude-standard"]);
  const entries = [];
  for (const filePath of listing.split("\0")) {
    if (filePath.length === 0) continue;
    const absolutePath = path.join(repoRoot, filePath);
    if (!lstatSync(absolutePath).isFile()) continue;
    const lines = readFileSync(absolutePath, "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    entries.push({
      path: filePath,
      oldPath: null,
      status: "added",
      addedLines: new Set(Array.from({ length: lines.length }, (_, index) => index + 1)),
    });
  }
  return entries;
}

function diffEntries(options) {
  if (options.workingTree) {
    const tracked = parseUnifiedDiff(git(options.repoRoot, ["diff", "--unified=0", "-M", "HEAD"]));
    return [...tracked, ...untrackedEntries(options.repoRoot)];
  }
  const base = validateBaseRef(options.base);
  return parseUnifiedDiff(
    git(options.repoRoot, ["diff", "--unified=0", "-M", "--end-of-options", base + "...HEAD"]),
  );
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    const files = selectRelevantFiles(diffEntries(options));
    const lcovFiles = collectLcovFiles(options.repoRoot);
    if (lcovFiles.length === 0) {
      throw new Error("No coverage/lcov.info found. Run: pnpm test:coverage");
    }

    const coverage = loadCoverage(lcovFiles, options.repoRoot);
    const baseline = loadBaseline(options.repoRoot);
    const result = evaluateDiff(files, coverage, baseline);
    const label = options.workingTree ? "working tree" : options.base + "...HEAD";
    console.log(formatReport(result, { label }));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
