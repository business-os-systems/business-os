## Summary of Changes

<!-- Provide a clear, concise summary of the changes introduced in this PR. -->

## Linked Issue

Closes #<!-- Specify issue number, e.g. Closes #10 -->

## Architectural Rationale & Trade-offs

<!-- Explain why this approach was chosen and any trade-offs considered. -->

## Type of Change

- [ ] `feat`: New feature or capability
- [ ] `fix`: Bug fix or defect resolution
- [ ] `chore`: Tooling, build pipeline, or dependency maintenance
- [ ] `docs`: Architectural documentation or specifications
- [ ] `perf`: Performance optimization or query improvement
- [ ] `refactor`: Code cleanup with zero behavioral changes

## Enterprise Quality Gate Checklist

- [ ] **Type Safety:** TypeScript passes with `strict: true` and **zero `any` types**.
- [ ] **Boundary Rules:** Unidirectional dependency flow respected; zero illegal cross-package imports.
- [ ] **Tenant Isolation:** All database and cache operations strictly scoped by `tenantId` / `branchId`.
- [ ] **Input Validation:** All network request payloads parsed and validated via Zod.
- [ ] **Error Handling:** RFC 7807 Problem Details envelopes used for errors.
- [ ] **Automated Tests:** Unit or integration tests added and passing in Vitest.
- [ ] **Diff Coverage:** `pnpm verify:diff` passes locally, or every uncovered line is an approved, unexpired baseline entry.
- [ ] **PR Size:** changed lines are within the 700-line soft ceiling, or the description explains why; never above the 1,000-line hard ceiling.
- [ ] **Conventional Commit:** PR title follows `type(scope): description (closes #X)`.

## Definition of Done (Constitution XVII — mandatory)

- [ ] **Requirement traceability:** the PR names the requirement ids or rule ids it implements.
- [ ] **Denial path tested:** every new or changed route has an authorization-denial test.
- [ ] **Audit asserted:** every mutation asserts its audit record.
- [ ] **Database boundary:** schema, runtime identity and grants updated together, with a boundary test (Principle XV).
- [ ] **Contract standards:** versioning/409, idempotency where applicable, cursor pagination, typed error codes (Principle XVI).
- [ ] **Data standards:** time, money, identifiers, caching and reference data follow Principle XVI where touched.
- [ ] **Documentation:** the relevant document under `05-modular-apps/<app>/` is updated in this change.
- [ ] **Reversibility:** rollback note present, or the change is flag-gated.
- [ ] **Observability:** new dependencies appear in health checks; new routes log with correlation and metrics.
- [ ] **Accessibility:** automated check and a keyboard path test pass for each new screen.
- [ ] **Terminology:** approved terms only; banned synonyms removed.
- [ ] **Rules named:** the rules applied are listed in the PR description.

## Wiring & Risk-to-Task Gate

- [ ] Every new runtime module has a non-test caller in this PR, or a linked deferred task id and target slice.
- [ ] Every new security module has a route-level denial or integration test, not only a unit test.
- [ ] Every residual risk is written as a task or issue id with a blocking flag; a risk without a task blocks merge.
- [ ] Library-only changes state that explicitly and name the consuming slice.
