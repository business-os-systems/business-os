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
- [ ] **Conventional Commit:** PR title follows `type(scope): description (closes #X)`.
