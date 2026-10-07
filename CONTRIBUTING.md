# Engineering SDLC & Contributing Guidelines
## The 12-Pillar Enterprise Governance Protocol
### Business OS (Composable Business Operating System)

Welcome to the **Business OS** engineering repository. This project is built and maintained to **top-tier enterprise standards** (modeled on the rigor of Stripe, Shopify Plus, Linear, and AWS).

Every contributor, engineer, and AI agent must adhere strictly to the **12-Pillar SDLC Framework** defined below.

---

## 1. Ticketing & Sprint Management

### Rule 1: Strict Issue-First Policy (Zero Un-Ticketed Work)
- **No ticket = No code.** Absolutely no branch is created, no file is edited, and no commit is made without an active, numbered GitHub Issue (`#X`) assigned to a Sprint Milestone.
- If a new defect, edge case, or refactor is identified, file an Issue first using `.github/ISSUE_TEMPLATE/` before touching any code.

### Rule 2: Deterministic Kanban State Machine
Every ticket transitions through 5 sequential states on the **Business OS Core Product Roadmap** project board:
1. `📋 Product Backlog`: Unscheduled future features or technical debt.
2. `🎯 Ready for Sprint`: Fully specified with concrete Pass/Fail acceptance criteria.
3. `⏳ In Progress`: Feature branch checked out and actively being coded.
4. `👀 In Review`: Pull request opened with all automated CI checks passing.
5. `✅ Done`: Pull request squash-merged to `main`, issue automatically closed.

---

## 2. Git & Branching Strategy

### Rule 3: Trunk-Based Development & Branch Naming
All branches are branched directly from the latest `origin/main` and must follow this exact convention:
- **Features:** `feat/#<issue-num>-<kebab-slug>` (e.g. `feat/#3-platform-db-schema`)
- **Bug Fixes:** `fix/#<issue-num>-<kebab-slug>` (e.g. `fix/#12-tenant-isolation-leak`)
- **Chores / Tooling:** `chore/#<issue-num>-<kebab-slug>` (e.g. `chore/#10-enterprise-sdlc-governance`)
- **Documentation:** `docs/#<issue-num>-<kebab-slug>` (e.g. `docs/#15-api-contracts`)
- **Emergency Hotfixes:** `hotfix/#<issue-num>-<kebab-slug>` (expedited path for production defects)

### Rule 4: Protected Mainline (`main`)
- `main` represents production state and must always be 100% deployable.
- **Direct pushes to `main` are strictly prohibited.**
- **Force-pushes (`git push --force`) to `main` are strictly prohibited.**
- All changes must enter `main` exclusively through a verified Pull Request.

---

## 3. Code Standards & Local Quality Gates

### Rule 5: Zero-Compromise Type Safety & Validation
- `strict: true` across all TypeScript compiler configurations.
- **Zero raw `any` types** and zero `@ts-ignore` bypasses.
- All network boundaries (REST endpoints, RPC parameters, BullMQ payloads) must be parsed and validated with **Zod**.
- **Type-Safe Environment Variables:** Every app validates its required environment variables at process boot; if any variable is missing or invalid, the process terminates immediately with an explicit error.

### Rule 6: Pre-Commit Quality Guard (Local Gates)
Before any commit is accepted, local verification runs:
1. Code formatting validation via `prettier`.
2. Static analysis and architectural boundary checks via `eslint`.
3. TypeScript compiler checks via `turbo run typecheck`.

---

## 4. Pull Request Lifecycle & Merging

### Rule 7: Pull Request Size Discipline (The Small PR Rule)
- Pull requests must be small, atomic, and focused (**< 400 lines of code changed**, excluding auto-generated lockfiles or database migrations).
- Large epics must be split into logical sub-tickets to ensure rigorous, fast code review.

### Rule 8: Mandatory CI Gates & Squash-Merge Strategy
- Every PR triggers GitHub Actions Continuous Integration (`.github/workflows/ci.yml`):
  - ✅ **Lint:** `pnpm turbo run lint`
  - ✅ **Typecheck:** `pnpm turbo run typecheck`
  - ✅ **Automated Tests:** `pnpm turbo run test`
- **Merge Strategy:** **Squash and Merge**. All intermediate local commits are squashed into a single clean commit on `main` formatted as:
  ```
  type(scope): concise description (closes #<issue-number>)
  ```
- Merging the PR auto-closes the issue and transitions the board card to `Done`.

---

## 5. Data Safety & Architecture Documentation

### Rule 9: Zero-Downtime Migration Policy (Expand-and-Contract)
- Destructive schema migrations (dropping columns, changing types in place) are prohibited on production schemas.
- Forward-only, timestamped SQL migrations applied via `prisma migrate deploy`.
- All seed scripts must be idempotent (`upsert`), ensuring repeat runs never fail or corrupt state.

### Rule 10: Architectural Decision Records (ADRs)
- Non-obvious architectural choices, library selections, or trade-offs must be documented as an ADR in `docs/adr/000X-title.md` covering: Context, Decision, Alternatives Considered, and Consequences.

---

## 6. AI Agent Operational Protocol & Absolute Guardrails

### Rule 11: The Agent's Mandatory 7-Step Cycle
When working on any ticket, the AI agent must strictly follow:
1. **Identify Issue:** Verify the assigned GitHub Issue number and pass/fail criteria.
2. **Branch:** Create isolated branch `git checkout -b <type>/#<issue-num>-<slug>` from latest `main`.
3. **Verify Identity:** Ensure commits are attributed to `Rohit Bahuguna <rohitbahuguna.work@gmail.com>`.
4. **Implement Scope:** Write code strictly adhering to the issue scope and architecture specs.
5. **Local Verification:** Run `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test`.
6. **Push & Open PR:** Push branch and create PR via `gh pr create` with linked issue `Closes #X`.
7. **Merge:** After CI checks pass and user approves, squash-merge to `main`.

### Rule 12: The Agent's Absolute Negative Constraints
The AI agent is **STRICTLY PROHIBITED** from:
- ❌ Direct pushing to `main`.
- ❌ Bypassing TypeScript errors with `@ts-ignore` or `any`.
- ❌ Deleting or disabling failing tests just to make a CI pipeline pass.
- ❌ Writing "TODO: add auth/security later" placeholders.
- ❌ Hardcoding mock data in production route handlers.
- ❌ Touching or modifying the live `river-view-homstay-lite` repository.

---

## 7. Developer Git Setup Checklist

Ensure your local repository uses your personal identity:
```bash
git config user.name "Rohit Bahuguna"
git config user.email "rohitbahuguna.work@gmail.com"
```
Local developer credentials and overrides must be placed in `.developer.identity.json`, which is permanently gitignored.
