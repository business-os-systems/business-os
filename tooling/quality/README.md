# Quality tooling

## Performance budgets (T124, FR-064, SC-009)

`perf-budgets.json` is the single source of truth for the Website Builder
release budgets. `validate-perf-budgets.mjs` validates the budget document and
compares a measured-results document with it. A breach, a missing surface, an
unknown metric or a malformed document exits non-zero, so CI turns red.

### Budget document schema

The canonical description is `perf-budgets.schema.json` (JSON Schema 2020-12).
The validator enforces the same closed contract:

```json
{
  "version": 1,
  "updatedAt": "2026-11-11",
  "surfaces": {
    "<surface>": {
      "kind": "storefront | dashboard",
      "path": "/route",
      "description": "Which screen this covers.",
      "budgets": {
        "htmlBytes": 0,
        "jsBytes": 0,
        "cssBytes": 0,
        "lcpMs": 0,
        "tbtMs": 0,
        "cls": 0.0
      }
    }
  }
}
```

- Storefront surfaces declare all six metrics: compressed HTML, JS and CSS
  transfer bytes, LCP, TBT (long-task time above 50 ms) and CLS.
- Dashboard surfaces declare `interactionP95Ms`: the 95th percentile of the
  wall-clock time from a keyboard or pointer action until the next rendered
  state.
- Unknown keys, metrics or surfaces are configuration errors, never warnings.
  A metric equal to its budget passes; one unit above fails.

### Measurement contract

`perf-budgets.json` is paired with a results document:

```json
{
  "generatedAt": "2026-11-11T00:00:00.000Z",
  "surfaces": {
    "storefront-home": {
      "htmlBytes": 3684,
      "jsBytes": 149383,
      "cssBytes": 7420,
      "lcpMs": 796,
      "tbtMs": 0,
      "cls": 0.0005
    },
    "dashboard-studio": { "interactionP95Ms": 226.1 }
  }
}
```

`apps/web/tests/e2e/performance.spec.ts` writes this file from the browser's
PerformanceObserver timeline and then invokes the validator, so a breach fails
the Playwright run as well as the explicit CI step.

### Running the gate

```bash
node tooling/quality/validate-perf-budgets.mjs \
  --budgets tooling/quality/perf-budgets.json \
  --results apps/web/test-results/release-evidence/perf-results.json \
  --report apps/web/test-results/release-evidence/perf-report.json

# Schema-only check
node tooling/quality/validate-perf-budgets.mjs --budgets tooling/quality/perf-budgets.json

# Validator proof: pass, breach, missing surface and unknown metric
node --test tooling/quality/perf-budgets.test.mjs
```

The Playwright suites are the runners: `accessibility.spec.ts` owns axe
WCAG 2.1 A/AA plus keyboard paths, `performance.spec.ts` owns the budgets and
`quickstart.spec.ts` covers the release journeys. Every suite renders the real
Next.js screens; only upstream reads are fulfilled with deterministic fixtures.

### CI wiring

`.github/workflows/ci.yml` job `release-gates` runs the accessibility suite,
the performance suite, the budget validator and the release checklist artifact,
then uploads `apps/web/test-results/**` and `artifacts/release-gates/**`.
The workflow also runs `perf-budgets.test.mjs` in the lint job, so a broken
budget document fails before a browser starts.

### Release checklist artifact

`release-checklist.mjs` consumes the axe evidence and the budget report and
writes `artifacts/release-gates/release-checklist.md` plus `.json`. Missing
accessibility evidence fails closed; a single violation or breach produces a
FAIL checklist and a non-zero exit.
