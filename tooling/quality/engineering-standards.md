# Engineering standards

This document holds the long examples and the operating detail behind
[code-quality-rules.md](./code-quality-rules.md). The short rules are binding;
this page explains how to apply them without changing behavior.

## Stack and layout

- TypeScript 5.9 (strict), pnpm workspaces, Turborepo, Changesets.
- Next.js 15 App Router + React 18 in `apps/dashboard` and `apps/platform`.
- Hono 4 + Zod OpenAPI in `apps/api`; Prisma in `packages/db`.
- Vitest across apps and packages. Zod is the validation library.
- Shared packages: `@suite/core`, `@suite/auth`, `@suite/db`, `@suite/flags`,
  `@suite/logger`, `@suite/redis`, `@suite/ui`.

Layers, in dependency order: `packages/core|flags|auth|logger` → `packages/db|redis`
→ `apps/api|apps/dashboard|apps/platform`. UI packages never read the database.
Routes never import the ORM. `dependency-cruiser` encodes these edges.

## P1

<a id="p1"></a>

### The flag-status case

The Platform flags table needs a status label and a text colour. The pre-refactor code
put the decision in four `if` statements:

```ts
function stateText(flag: FlagRecord) {
  if (flag.isExpired) return { label: "Expired", className: "text-danger" };
  if (flag.isEnabled && flag.defaultEnabled) return { label: "On", className: "text-success" };
  if (flag.isEnabled && flag.rules.length > 0)
    return { label: "Targeted", className: "text-brand" };
  if (flag.isEnabled) return { label: "Master on", className: "text-warning" };
  return { label: "Off", className: "text-text-secondary" };
}
```

Priority is hidden in line order, presentation is mixed with the rule, and adding a
state means editing a chain that has no compile-time exhaustiveness.

The refactor has four parts.

1. A state union derived from an `as const` array, so the states are data:

```ts
export const FLAG_STATES = ["expired", "on", "targeted", "master-on", "off"] as const;
export type FlagState = (typeof FLAG_STATES)[number];
```

2. A pure derivation function in its own file. It returns only the state; it knows
   nothing about Tailwind classes:

```ts
export interface FlagStateInput {
  readonly isExpired: boolean;
  readonly isEnabled: boolean;
  readonly defaultEnabled: boolean;
  readonly ruleCount: number;
}

export function deriveFlagState(flag: FlagStateInput): FlagState {
  if (flag.isExpired) return "expired";
  if (!flag.isEnabled) return "off";
  if (flag.defaultEnabled) return "on";
  if (flag.ruleCount > 0) return "targeted";
  return "master-on";
}
```

3. A presentation map that fails compilation when a state is missing:

```ts
const FLAG_STATE_PRESENTATION = {
  expired: { label: "Expired", className: "text-danger" },
  on: { label: "On", className: "text-success" },
  targeted: { label: "Targeted", className: "text-brand" },
  "master-on": { label: "Master on", className: "text-warning" },
  off: { label: "Off", className: "text-text-secondary" },
} as const satisfies Record<FlagState, { label: string; className: string }>;
```

4. A table-driven test that locks the priority order and the presentation:

```ts
it.each([
  [
    "expired wins over every other flag",
    { isExpired: true, isEnabled: true, defaultEnabled: true, ruleCount: 2 },
    "expired",
  ],
  [
    "disabled is off",
    { isExpired: false, isEnabled: false, defaultEnabled: true, ruleCount: 2 },
    "off",
  ],
  [
    "default wins over targeting",
    { isExpired: false, isEnabled: true, defaultEnabled: true, ruleCount: 1 },
    "on",
  ],
  [
    "rules make it targeted",
    { isExpired: false, isEnabled: true, defaultEnabled: false, ruleCount: 1 },
    "targeted",
  ],
  [
    "enabled without a default or rules",
    { isExpired: false, isEnabled: true, defaultEnabled: false, ruleCount: 0 },
    "master-on",
  ],
])("%s", (_name, input, expected) => {
  expect(deriveFlagState(input)).toBe(expected);
});
```

The lint detector has one message per returned object and fires on the original code:

```text
$ pnpm lint:p1
tooling/eslint-rules/fixtures/flag-status.bad.ts
  11:12  error  Do not return UI props from if/else...
  14:12  error  Do not return UI props from if/else...
  17:12  error  Do not return UI props from if/else...
  20:12  error  Do not return UI props from if/else...
```

The detector flags any returned object that carries a presentation prop
(`variant`, `label`, `color`, `severity`, `icon`, `className`) **unless** the
object's own keys identify it as a configuration/DTO payload: `name`, `id`,
`href`, `appId`, `permission`, or `description`. That keeps two shapes valid —
a form-field schema (`label` next to `name`, `type`, `required`) and a dashboard
app DTO (`icon` next to `id`/`href`/`permission`) — while a mixed presentation
object such as `{ label, className, value }` is still flagged. Both valid shapes
are fixtures under `tooling/eslint-rules/fixtures/*.good.ts` and RuleTester cases
in `custom-rules.test.mjs`; the original flag-status code remains the invalid
fixture.

The production derivation (`apps/platform/src/components/flags/flags-table.config.tsx`)
no longer carries a P1 suppression entry, so a regression there fails `pnpm lint`
directly. Only the fixture is exempt from the suppression baseline, because it is
the proof that the rule fires.

### Adding a new state

1. Add the literal to `FLAG_STATES`.
2. Add the branch to `deriveFlagState` (priority is explicit and tested).
3. Add the entry to `FLAG_STATE_PRESENTATION`; the compiler rejects a missing entry.
4. Add one table row and, if the state is user-visible, one render assertion.

## P2

<a id="p2"></a>

Allowed direction:

```text
route/controller -> service -> data layer
component -> API client -> API
domain package -> no UI, no app
```

A route may validate with Zod, call one service function, and return a response. When
the route grows a query, move it to `src/services`. A component may hold view state;
when it starts deciding tenancy, roles, or expiry, move the decision to the API and
return the result in the DTO.

## P3

<a id="p3"></a>

Prefer a literal union or an `as const` object over an enum unless the package
already uses enums.

```ts
export const FLAG_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];
```

Name units: `SESSION_TTL_SECONDS`, `CACHE_TTL_SECONDS`, `MAX_PAGE_SIZE`.

## P4

<a id="p4"></a>

Before extracting, check whether both copies are the same rule or merely similar
code. Extract on the third occurrence, or immediately when the copies encode a
security/tenancy rule. The API is the source of truth for derived values; clients
render what the DTO says.

## P5

<a id="p5"></a>

```ts
const parsed: unknown = await response.json();
const user = userSchema.parse(parsed);
```

Use `satisfies` to check a literal without widening it. Never use a type assertion to
silence a boundary; parse the boundary instead.

## P6

<a id="p6"></a>

Use one discriminated union at the point where the states meet. Keep the union small:
`loading | error | ready` is enough for most screens. A `switch` over the union plus a
`never` check catches a new state at compile time.

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${String(value)}`);
}
```

## P7

<a id="p7"></a>

Convert nested conditionals to guard clauses:

```ts
if (!tenant) return notFound();
if (!canManage) return forbidden();
return service.suspend(tenant);
```

When a fourth positional parameter appears, pass an options object. When a function
passes 60 lines, extract the named step that the reader is already mentally naming.

## P8

<a id="p8"></a>

Brand only at the boundary where the identifier enters the domain:

```ts
declare const userIdBrand: unique symbol;
export type UserId = string & { readonly [userIdBrand]: true };
```

Do not brand every string; the conversion boilerplate must buy real safety.

## P9

<a id="p9"></a>

```ts
try {
  await gateway.call();
} catch (error) {
  throw new DependencyUnavailableError("Gateway unavailable", { cause: error });
}
```

Log once, at the layer that has context, and never log secrets or full request bodies.

## P10

<a id="p10"></a>

Validate at the edge and infer the type:

```ts
export const createFlagSchema = z.object({
  key: z.string().min(3).max(120),
  environment: z.enum(FLAG_ENVIRONMENTS),
});
export type CreateFlagInput = z.infer<typeof createFlagSchema>;
```

Environment variables belong in one config module that parses `process.env` at
startup and fails closed.

## P11

<a id="p11"></a>

```ts
const rows = await prisma.flag.findMany({
  where: { tenantId },
  take: limit + 1,
  cursor: cursor ? { id: cursor } : undefined,
  select: { id: true, key: true, isEnabled: true },
});
```

Multi-write operations use `prisma.$transaction`. Raw SQL is parameterized and lives
in the data layer only.

## P12

<a id="p12"></a>

```ts
const results = await Promise.all(tasks.map((task) => run(task)));
```

Bound concurrency for large batches and attach an `AbortSignal` to external calls.
`void promise` is a last resort with a comment naming the error boundary.

## P13

<a id="p13"></a>

```ts
const ordered = items.toSorted((a, b) => a.order - b.order);
const next = { ...current, enabled: true };
```

Accept `readonly T[]` in pure functions to make the contract explicit.

## P14

<a id="p14"></a>

`apps/api/src/lib/platform-env.ts` is the model: parse once, export a typed object,
and fail startup when a required value is missing. Feature code imports the config
object; it never reads `process.env` directly. The lint exception list is limited to
config modules, scripts, and tests.

## P15

<a id="p15"></a>

Delete commented-out code. Replace `console.log` with `@suite/logger`. A TODO that
survives review needs an owner and a ticket, for example
`// TODO(#123, owner): remove after the migration`.

## P16

<a id="p16"></a>

For every behavior-preserving refactor, write the characterization test first and run
it against the old code. Table-driven tests are preferred when the function is a
decision table:

```ts
it.each([
  [{ isExpired: true, isEnabled: true }, "expired"],
  [{ isExpired: false, isEnabled: false }, "off"],
] as const)("%o -> %s", (input, expected) => {
  expect(deriveFlagState(input)).toBe(expected);
});
```

Tests assert outcomes, not private call counts. A bug fix ships with a test that fails
before the fix.

## P17

<a id="p17"></a>

Use the central authorization helpers and scope every query by the tenant. Never
render raw HTML; when a third-party payload must be rendered, sanitize it in one
reviewed boundary and test the dangerous input.

## Legacy adoption and the ratchet

- Every current violation is recorded in `eslint-suppressions.json` by
  `pnpm exec eslint . --suppress-all`. The file is committed.
- `pnpm lint` passes on the baseline and fails when a new violation appears, even in
  a file that already has suppressed entries.
- After fixing a finding, run `pnpm lint:prune` to remove stale entries and commit
  the smaller file. The count can only go down.
- Do not add a suppression by hand to hide a new violation. Suppressions are for code
  that predates the rule; new code must comply.
- The P1 fixture and the RuleTester suite are exempt from suppressions because they
  are the proof that the rules work.

## Ratchet workflow

The quality gates are ratchets: the baseline may shrink, never grow. The lint,
typecheck, build, and test jobs stay blocking; the reports below are triaged
registries instead of failing on day one.

### Diff coverage

`pnpm test:coverage` runs the `coverage` Turbo task in every package and writes
`<package>/coverage/lcov.info`. `tooling/quality/diff-coverage.mjs` maps the
added lines of a git diff onto those records.

```bash
# Local feature branch, with origin/dev fetched
pnpm test:coverage
node tooling/quality/diff-coverage.mjs --base origin/dev

# Uncommitted work, including untracked files
node tooling/quality/diff-coverage.mjs --working-tree

# The gate's own unit proof (also a step in the Lint, rules & reports job)
node --test tooling/quality/diff-coverage.test.mjs
```

The root `test:coverage` script passes `--concurrency=1`. The logger throughput
benchmark is timing-sensitive: under parallel Turbo load its measured per-call
cost climbed from ~2.4 s to ~10.8 s against a 10 s ceiling, which made the gate
flaky. Serial execution keeps the coverage signal deterministic and costs only
wall-clock time.

CI jobs: the **Diff Coverage** job runs the gate on pull requests only, with
`fetch-depth: 0`, after `pnpm test:coverage` and `--base origin/<base_ref>`.
Its unit proof (`diff-coverage.test.mjs`) runs in **Lint, rules & reports** so
the parser, the base-ref validation and the report format are tested on every
push and pull request.

Rules:

- Every newly added executable line needs a non-zero `DA` count. The baseline is
  zero uncovered added lines; there is no per-file allowance.
- A changed source file with no lcov record fails as unverifiable. It is reported
  under `NO LCOV RECORD`, never treated as covered.
- Added lines without a `DA` record are blank or comments and are skipped.
- Only script files are measurable: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`,
  `.cjs`, `.mts`, `.cts`. Everything else is excluded by class, not by an
  ever-growing list: tests and fixtures, migrations, `dist`/build output,
  generated code, database schema files (`*.prisma`), configuration
  (`*.config.*`, `*.preset.*`, `tsconfig*`, `package.json`, lockfiles,
  YAML/JSON), dotfile configs such as `.dependency-cruiser.cjs`, docs,
  Dockerfiles, shell scripts, `.github/**`, and `tooling/**`. CI tooling is
  proven by `node --test` and `pnpm test:rules`, not by Vitest; adding a
  Vitest lcov record there would be a false signal.
- Deleting a file or renaming it does not add lines; the tool ignores both.
- The script exits 1 on any uncovered line or missing record and 2 when the
  arguments are invalid or no lcov file exists (the coverage task did not run).

### Knip (report-only)

`pnpm knip:report` runs Knip with `--no-exit-code` in the **Lint, rules &
reports** job. It answers "what is unused?" and never fails CI. Every remaining
finding is triaged in [knip-baseline.md](./knip-baseline.md) with what it is, why
it is kept, an owner, and an expiry. Deleting an accepted item before its expiry
needs an issue; adding a new unused file, export, or dependency is not accepted
because the baseline is full.

This issue removed the genuinely dead items: four files (three unused barrels
and a re-export shim) and five unused dependencies. The one remaining unused file
is referenced from a workflow YAML, which Knip does not parse, so it is recorded
rather than deleted. Unused exports and exported types are not mass-edited:
removing a public package export is an API change, not a cleanup.

### jscpd (report-only)

`pnpm dup:report` runs jscpd with the repository config and prints the clone
report; the **Lint, rules & reports** job runs it, and the npm script ends in
`|| true`, so it is report-only on every push and pull request. The triage and
the decision for every cluster live in
[duplication-triage.md](./duplication-triage.md).

The extraction rule is narrow: extract one small shared helper only when the same
_rule_ appears at least three times. Similar-looking JSX, two-copy pairs, and
route scaffolding that would need a cross-cutting refactor stay as they are and
are recorded for a dedicated ticket. This issue did not change application code
under the triage.

### Exception registries

| Registry                                       | Scope                                 | Rule                                                                                      |
| ---------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `eslint-suppressions.json`                     | Legacy lint violations                | `pnpm lint` passes on the baseline and fails on a new violation. Never hand-add an entry. |
| `tooling/quality/knip-baseline.md`             | Dead code, unused deps, unlisted deps | Report-only; each entry has an owner and expiry.                                          |
| `tooling/quality/duplication-triage.md`        | jscpd clones                          | Report-only; each cluster has a decision.                                                 |
| `tooling/quality/diff-coverage.mjs` exclusions | Unmeasurable added lines              | Narrow path classes only; no per-file bypass.                                             |

### `pnpm lint:prune`

When a fix removes a legacy violation, run `pnpm lint:prune` and commit the
smaller `eslint-suppressions.json`. Pruning only drops entries that no longer
match; the count can only go down. Do not edit the file by hand to silence a new
violation.

### P1 fixture proof

```bash
pnpm lint:p1                     # must print exactly four errors and exit 1
pnpm test:rules                  # RuleTester proof for every selector
pnpm exec eslint --no-config-lookup \
  --config tooling/eslint-rules/p1-proof.config.mjs \
  tooling/eslint-rules/fixtures/flag-rule-config.good.ts \
  tooling/eslint-rules/fixtures/dashboard-app-dto.good.ts   # zero errors
```

The detector flags a returned object with a presentation prop unless its own keys
identify a configuration/DTO payload (`name`, `id`, `href`, `appId`, `permission`,
`description`). A form-field schema (`label` next to `name`/`type`) and a dashboard
app DTO (`icon` next to identity fields) are therefore valid, while the original
flag-status shape and a mixed `{ label, className, value }` object still fail.
Both directions are encoded in `custom-rules.test.mjs` and in the two
`.good.ts` fixtures.

### CI job names

| Job                    | Trigger       | Purpose                                                                                |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------- |
| Lint, rules & reports  | every push/PR | `pnpm lint`, `pnpm test:rules`, gate unit tests, knip/dependency-cruiser/jscpd reports |
| Build                  | every push/PR | `pnpm turbo run build`                                                                 |
| Typecheck & Test       | every push/PR | `pnpm turbo run typecheck test`                                                        |
| Diff Coverage          | pull requests | `pnpm test:coverage` then `diff-coverage.mjs --base origin/<base_ref>`                 |
| Lint, Typecheck & Test | every push/PR | aggregate check for the three blocking jobs                                            |

## Tooling map

| File                                               | Purpose                                             |
| -------------------------------------------------- | --------------------------------------------------- |
| `eslint.config.mjs`                                | Single flat config, type-aware, folder overrides    |
| `tooling/eslint-rules/selectors.mjs`               | Shared custom selectors and messages                |
| `tooling/eslint-rules/custom-rules.test.mjs`       | RuleTester proof for each custom rule               |
| `tooling/eslint-rules/fixtures/flag-status.bad.ts` | The original P1 code, expected to fail              |
| `tooling/eslint-rules/fixtures/*.good.ts`          | Valid shapes the P1 detector must not flag          |
| `eslint-suppressions.json`                         | Legacy ratchet baseline                             |
| `tooling/tsconfig/base.json`                       | Strict compiler flags for every package             |
| `knip.json`                                        | Dead code and dependency report                     |
| `tooling/quality/knip-baseline.md`                 | Accepted Knip findings with owner and expiry        |
| `tooling/quality/duplication-triage.md`            | Accepted jscpd clusters and extraction decisions    |
| `tooling/quality/diff-coverage.mjs`                | Added lines vs lcov; pull-request gate              |
| `tooling/quality/diff-coverage.test.mjs`           | `node --test` proof for the coverage gate           |
| `.dependency-cruiser.cjs`                          | Layer and cycle rules                               |
| `.husky/pre-commit` + `lint-staged`                | Staged files are linted, fixed, and typechecked     |
| `.github/workflows/ci.yml`                         | Lint, build, typecheck/test, reports, diff coverage |

## Known follow-ups

- `exactOptionalPropertyTypes` is not enabled yet. A probe with the flag produced
  about 200 errors, mostly `TS2375/TS2379/TS2412` in dashboard DTO construction. It
  needs its own characterization pass and is tracked as a follow-up rather than
  hidden behind suppressions.
- `packages/ui/tests` is linted without type information because the package
  tsconfig only includes `src`. Add a lint-only tsconfig before adding type-aware
  rules there.
- `knip` stays report-only by design: the 145 unused exports and 88 unused
  exported types need a separate API-surface pass. Each accepted finding has an
  owner and expiry in `knip-baseline.md`.
- `dependency-cruiser` still runs in report mode; its findings have no registry
  yet.
- The jscpd clusters recorded in `duplication-triage.md` need a dedicated
  extraction ticket before any application code is refactored.
- Diff coverage is enforced on pull requests; the baseline is zero uncovered
  added lines. Files excluded by path class are listed under the ratchet
  workflow and in `diff-coverage.mjs`.

## Review checklist

1. Does the change return UI props from a conditional? Use a state map.
2. Does a route or component import the ORM or cache?
3. Is a literal, duration, or identifier repeated without a name?
4. Is there an `any`, `!`, `@ts-ignore`, or unchecked assertion?
5. Can the state be `loading` and `error` at once?
6. Does a function exceed 60 lines, 3 levels, 4 parameters, or a 10/15 complexity
   budget?
7. Is input validated at the boundary?
8. Is the query paginated, scoped, and transactional where needed?
9. Is every promise awaited or deliberately returned?
10. Are mutations immutable?
11. Is configuration read through the config module?
12. Are dead code, debug logs, and ticketless TODOs gone?
13. Is there a test that fails without the change?
14. Is authorization default-deny and tenant-scoped?
