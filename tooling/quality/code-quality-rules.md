# Code Quality Standards (agent rules)

These rules are binding for every change in this repository. They are enforced by
`eslint.config.mjs`, `tooling/tsconfig/base.json`, `knip`, and
`dependency-cruiser` where a reliable rule exists. Long examples and the
remediation workflow live in [engineering-standards.md](./engineering-standards.md).

**Before finishing any task, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`;
fix violations properly; list any principle you knowingly violated and why.**
Never add a blanket `eslint-disable`, `@ts-ignore`, or `any` to get green.
Never weaken a test or a lint rule to make a change pass.

## P1

**Rule.** Do not return UI props (`variant`, `label`, `color`, `severity`, `icon`,
`className`) from an `if`/`else` chain or a `switch`. Derive a typed state first,
then map it once. The lint detector exempts a returned object whose own keys
identify a configuration/DTO payload (`name`, `id`, `href`, `appId`, `permission`,
`description`), so a form-field schema or a boundary DTO is not a false positive.

**BAD** (`apps/platform/src/components/flags/flags-table.config.tsx`):

```ts
if (flag.isExpired) return { label: "Expired", className: "text-danger" };
if (flag.isEnabled && flag.defaultEnabled) return { label: "On", className: "text-success" };
return { label: "Off", className: "text-text-secondary" };
```

**GOOD**:

```ts
type FlagState = "expired" | "on" | "targeted" | "master-on" | "off";

const FLAG_STATE: Record<FlagState, { label: string; className: string }> = {
  expired: { label: "Expired", className: "text-danger" },
  on: { label: "On", className: "text-success" },
  targeted: { label: "Targeted", className: "text-brand" },
  "master-on": { label: "Master on", className: "text-warning" },
  off: { label: "Off", className: "text-text-secondary" },
};

const state = deriveFlagState(flag);
return FLAG_STATE[state];
```

**Exception.** One to three branches, a single call site, and no reuse elsewhere.

## P2

**Rule.** Keep domain decisions and data access out of components, controllers, and
templates. A controller validates, calls a service, and maps the result; a component
renders.

**BAD**: a route handler imports `@suite/db` and builds a Prisma query inline.
**GOOD**: the route calls `tenantService.find(id)`; the service owns the query.

**Exception.** None for transport/presentation folders; the folder overrides are
enforced by `no-restricted-imports`.

## P3

**Rule.** Name repeated literals and numbers. Use `as const` objects or literal
unions, and put the unit in the name (`SESSION_TTL_SECONDS`).

**BAD**: `if (role === "owner") { setTimeout(fn, 86400); }`
**GOOD**: `if (role === ROLE.OWNER) { setTimeout(fn, SESSION_TTL_SECONDS); }`

**Exception.** Values used once, next to the code that explains them, and the
conventional `0 / 1 / -1` and array indexes.

## P4

**Rule.** Keep one source of truth for a rule or derived value. Share a pure package
or derive it on the server and return it in the DTO.

**BAD**: the dashboard and the API each compute whether a tenant is suspended.
**GOOD**: the API returns `status` in the DTO; the dashboard renders it.

**Exception.** Two tiny one-line expressions may stay duplicated until the third
occurrence.

## P5

**Rule.** Prefer `unknown` plus narrowing, type guards, and schema parsing at the
boundary. Do not use `any`, unchecked `as`, `!`, `@ts-ignore`, or `Object`/`{}`.

**BAD**: `const body = (await res.json()) as User;`
**GOOD**: `const body = userSchema.parse(await res.json());`

**Exception.** A documented third-party adapter may need a single narrow assertion
with a comment explaining the runtime guarantee; it still needs review.

## P6

**Rule.** Replace boolean clusters (`isLoading`, `isError`, `isSuccess`) and optional
fields that can form impossible states with a discriminated union and an exhaustive
`switch`.

**BAD**: `{ isLoading: boolean; isError: boolean; data?: T }`
**GOOD**: `{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: T }`

**Exception.** A boolean that is genuinely independent, such as `disabled`.

## P7

**Rule.** Keep functions at or below 60 lines, nesting at or below 3, parameters at or
below 4, cyclomatic complexity at or below 10, and cognitive complexity at or below 15. Use guard clauses; never chain ternaries.

**BAD**: a 90-line handler with four nested `if` blocks and a nested ternary.
**GOOD**: guard clauses, named helpers, and a parameter object when a fourth argument
arrives.

**Exception.** Generated code and table-driven test bodies; the lint baseline records
legacy exceptions.

## P8

**Rule.** Use branded types or small value objects at domain boundaries for identifiers
that can be swapped silently (`UserId`, `OrgId`, `Email`, `Money`).

**BAD**: `transfer(fromAccountId: string, toAccountId: string)`
**GOOD**: `transfer(from: AccountId, to: AccountId)`

**Exception.** Do not brand every string; only boundaries where a swap is plausible
and costly.

## P9

**Rule.** Never swallow an error. Rethrow with `new Error(message, { cause })`, throw
typed domain errors, and return explicit result types where failure is expected.

**BAD**: `catch (error) { console.log(error); }`
**GOOD**: `catch (error) { throw new ServiceUnavailableError("...", { cause: error }); }`

**Exception.** A deliberate best-effort cleanup may ignore a failure only when the
comment names the invariant it protects.

## P10

**Rule.** Validate every request body, query parameter, env var, webhook, and external
response at the edge with the repository schema library (Zod). Infer types from the
schema; do not duplicate them.

**BAD**: `const { email } = await req.json();`
**GOOD**: `const input = createUserSchema.parse(await req.json());`

**Exception.** Health probes and static asset routes with no payload.

## P11

**Rule.** Paginate every list with a hard cap, batch or include related rows, select
only needed fields, and use a transaction for multi-step writes. Never concatenate SQL.

**BAD**: `prisma.tenant.findMany()` after a loop calls `findUnique`.
**GOOD**: one `findMany({ take: limit + 1, cursor, select })` plus an `include`.

**Exception.** Seeding and migration scripts, which are not request paths.

## P12

**Rule.** Await or deliberately return every promise. Use `Promise.all` for
independent work, bound concurrency, set timeouts, and remove `async` when there is no
`await`.

**BAD**: `items.forEach(async (item) => { await save(item); });`
**GOOD**: `await Promise.all(items.map((item) => save(item)));`

**Exception.** Fire-and-forget work is allowed only through the project's job/queue
abstraction, never a bare promise.

## P13

**Rule.** Do not mutate arguments, props, or shared arrays. Use immutable updates and
`toSorted`/spread; accept `readonly` inputs.

**BAD**: `options.sort(); props.items.push(item);`
**GOOD**: `const ordered = options.toSorted(); onChange([...items, item]);`

**Exception.** A local array created inside the function may be sorted in place.

## P14

**Rule.** Read configuration only through a typed, validated config module. Never read
`process.env` in feature code; never commit secrets or log them.

**BAD**: `fetch(process.env.API_URL + "/tenants")`
**GOOD**: `fetch(`${config.apiUrl}/tenants`)`

**Exception.** The config module, test harnesses, and build scripts.

## P15

**Rule.** Delete dead code (git remembers it), use the logger instead of
`console.log`, and comment WHY rather than WHAT. A TODO needs an owner or a ticket.

**BAD**: `// set user id` plus a commented-out block and `console.log(user)`.
**GOOD**: a comment explaining the invariant, and `logger.info({ userId }, "...")`.

**Exception.** `console.warn`/`console.error` remain allowed where the logger is not
available during startup.

## P16

**Rule.** Add a regression test for every bug fix and table-driven tests for pure
logic. Test behavior, not implementation details; cover the denial path. Every
added source line needs a test: the pull-request Diff Coverage gate fails on an
uncovered added line, and an untested new file is unverifiable, not exempt.

**BAD**: one test that asserts a private helper was called.
**GOOD**: a table of `(input, expected)` rows and a route-level denial test.

**Exception.** A pure type-only change may rely on `tsc`; say so in the PR.

## P17

**Rule.** Default-deny authorization, scope every tenant query, redact PII from logs,
and never inject raw HTML. Use the framework's sanitizer if raw HTML is unavoidable.

**BAD**: `<div dangerouslySetInnerHTML={{ __html: comment.body }} />`
**GOOD**: render text, or pass sanitized content through the approved component.

**Exception.** A documented, reviewed sanitizer boundary with a test proving the
dangerous input is neutralized.

## Enforcement map

| Command                 | What it proves                                                       |
| ----------------------- | -------------------------------------------------------------------- |
| `pnpm lint`             | Rules above; legacy code is suppressed in `eslint-suppressions.json` |
| `pnpm test:rules`       | The custom P1/P14/P17 and import restrictions fail on bad fixtures   |
| `pnpm lint:p1`          | The original flag-status fixture fails (expected exit 1)             |
| `pnpm typecheck`        | Strict TypeScript across every package                               |
| `pnpm test`             | Behavior is unchanged                                                |
| `pnpm knip:report`      | Dead files, exports, and dependencies (report mode)                  |
| `pnpm depcruise:report` | Layer and cycle violations (baseline in report mode)                 |

See the locally generated, gitignored `docs/quality-audit.md` for the current
baseline and the approved remediation queue.
