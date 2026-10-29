# Engineering SDLC & Contributing Guidelines
## The 12-Pillar Enterprise Governance Protocol
### Universal Composable Business Operating System (Business OS)
### Target Workspace: `/home/rohit-bahuguna/RB/business-os`

Welcome to the **Business OS** engineering repository. This project is built and maintained to **top-tier enterprise standards** (modeled on the engineering rigor of Stripe, Shopify Plus, Linear, and AWS).

Every contributor, engineer, and AI agent must adhere strictly to the **12-Pillar SDLC Framework** and monorepo architectural rules defined below.

---

## 1. Identity & Git Committer Configuration

All Git actions, commits, and PRs in this repository **MUST** use this developer identity:
- **Author Name:** `Rohit Bahuguna`
- **Author Email:** `rohitbahuguna.work@gmail.com`
- **SSH Remote Host:** `github-personal` (configured in `~/.ssh/config` using `~/.ssh/personal`)
- **Git Push Remote:** `origin` (`git@github-personal:business-os-systems/business-os.git`)
- Local overrides and developer credentials are stored in `.developer.identity.json` (permanently gitignored).

---

## 2. Ticketing & Sprint Management

### Rule 1: Strict Issue-First Policy & Mandatory Human Issue Approval Gate (NO TICKET = NO CODE)
- **You are STRICTLY FORBIDDEN from writing code, editing files, creating branches, or committing without an active, numbered GitHub Issue (`#X`).**
- **MANDATORY HUMAN ISSUE APPROVAL GATE:**
  - AI agents are **STRICTLY FORBIDDEN from autonomously creating GitHub issues or milestones**.
  - Before creating ANY GitHub issue:
    1. The agent **MUST ask the user first** and present the proposed issues in a **clear tabular view** (ticket code, title, architectural meaning, target packages, prerequisites, priority).
    2. The agent **MUST WAIT for explicit written approval** before running `gh issue create` or creating any milestone.
- Before doing ANY work:
  1. Check open issues using `gh issue list --repo business-os-systems/business-os`.
  2. If an approved ticket does not exist for the work requested, follow the Human Issue Approval Gate above.
  3. Only then proceed to create the branch.

### Rule 2: Deterministic Kanban State Machine
Every ticket transitions through 5 sequential states on the **Business OS Core Product Roadmap** project board:
1. `📋 Product Backlog`: Unscheduled future features or technical debt.
2. `🎯 Ready for Sprint`: Fully specified with concrete Pass/Fail acceptance criteria.
3. `⏳ In Progress`: Feature branch checked out and actively being coded.
4. `👀 In Review`: Pull request opened targeting `dev` with all automated CI checks passing.
5. `✅ Done`: Pull request squash-merged to `dev` (with subsequent environment promotion to `staging` and `main`), issue closed.

---

## 3. Git & Branching Strategy

### Rule 3: 3-Tier Environment Promotion Pipeline
We follow a structured 3-tier environment promotion architecture modeling enterprise release trains:

```
feat/#X-slug ──(PR)──> dev ──(Promotion PR)──> staging ──(Release PR)──> main
  [Feature]          [Dev Env]               [Staging/Beta]           [Production]
```

1. **`dev` (Development Environment):**
   - Active daily integration branch. **ALL feature work branches from and targets `dev`.**
   - Connected to development databases and test sandbox services.
2. **`staging` (Pre-Production / Beta Environment):**
   - Staging mirror for end-to-end integration testing, 4:00 AM night audit simulations, and beta customer preview.
   - Promoted from `dev` at sprint milestones.
3. **`main` (Live Production Environment):**
   - The live, revenue-generating production system powering paying businesses.
   - Deployed strictly via verified Release PRs from `staging` with SemVer release tagging.

### Rule 4: Protected Branches & Branch Naming Standard
- **Protected Branches:** Direct pushes and force-pushes (`git push --force`) to `main`, `staging`, and `dev` are strictly prohibited.
- **Branch Naming Standard:**
  ```bash
  git checkout -b <type>/#<issue-number>-<short-kebab-slug> dev
  ```
  - **Features:** `feat/#<issue-num>-<kebab-slug>` (e.g. `feat/#3-platform-db-schema`)
  - **Bug Fixes:** `fix/#<issue-num>-<kebab-slug>` (e.g. `fix/#12-tenant-isolation-leak`)
  - **Chores / Tooling:** `chore/#<issue-num>-<kebab-slug>` (e.g. `chore/#14-add-agents-md`)
  - **Documentation:** `docs/#<issue-num>-<kebab-slug>` (e.g. `docs/#15-api-contracts`)
  - **Emergency Hotfixes:** `hotfix/#<issue-num>-<kebab-slug>` (branched from `main`, backported to `staging` and `dev`)

---

## 4. Monorepo Topology & Architectural Boundaries

### Master Workspace Directory Layout
```
business-os/
├── .changeset/                   # Semantic versioning and changelog generator
├── .github/                      # CI/CD GitHub Actions workflows
├── .husky/                       # Pre-commit git hooks (lint-staged, boundary check)
├── .npmrc                        # Strict pnpm configuration
├── package.json                  # Root monorepo workspace package.json
├── pnpm-lock.yaml                # Deterministic lockfile
├── pnpm-workspace.yaml           # Workspace declaration
├── turbo.json                    # Turborepo task pipeline and caching rules
│
├── apps/                         # Executable Deployable Applications
│   ├── api/                      # Hono v4 REST + RPC API Gateway (Node.js 22)
│   ├── dashboard/                # Next.js 16 App Router Multi-Tenant Admin Portal
│   ├── web/                      # Next.js 16 Public Guest Storefront & Engine
│   ├── worker-audit/             # Standalone BullMQ Worker (Hash chaining & Archival)
│   ├── desktop/                  # Tauri v2 POS Offline Desktop Shell (Rust + Web)
│   ├── mobile/                   # Capacitor v8 Android/iOS Staff App
│   └── ai-service/               # Python 3.12 FastAPI + LangGraph Sidecar
│
├── packages/                     # Core Platform Libraries & Shared Primitives
│   ├── db/                       # Prisma v6 client, Schema folders & Tenant extensions
│   ├── auth/                     # Better-Auth instantiation, Session MW, Passkeys, SSO
│   ├── core/                     # RBAC evaluator, Operational clock turnover, Zod schemas
│   ├── audit-sdk/                # BullMQ audit producer, SHA-256 cryptographic chaining
│   ├── media/                    # Cloudflare R2 S3 client, presigned URL helpers
│   ├── redis/                    # ioredis client singleton, distributed locks, rate limiters
│   ├── logger/                   # Pino v9 structured logger with correlation IDs
│   └── ui/                       # Shared shadcn/ui components & Tailwind v4 variables
│
├── packages/modules/             # Modular Business Suite Apps (Pluggable Verticals)
│   ├── sites-cms/                # App 1: Headless CMS & Visual Website Builder
│   ├── booking-engine/           # App 2: Public Booking Engine & Guest Portal
│   ├── lodging-pms/              # App 3: Lodging PMS & Front Desk
│   ├── restaurant-pos/           # App 4: Restaurant POS & Kitchen Display (KDS)
│   ├── inventory/                # App 5: Central Stock & Material Requisitions
│   └── ...                       # Subsequent modular apps (6 to 12)
│
└── tooling/                      # Shared Developer Tooling & Configurations
    ├── tsconfig/                 # Shared tsconfig bases (base, nextjs, react, node)
    ├── eslint-config/            # ESLint flat config + import boundary rules
    ├── tailwind-config/          # Tailwind CSS v4 shared styling tokens
    └── prettier-config/          # Shared formatting rules
```

### Architectural Boundary Directives:
1. **Unidirectional Flow:** Code flows strictly downward (`apps/*` $\rightarrow$ `packages/modules/*` $\rightarrow$ `packages/*`).
2. **Zero Cross-App Imports:** Deployable apps (`apps/*`) never import other apps directly.
3. **Zero Cross-Module Direct Imports:** Pluggable modules (`packages/modules/*`) never import each other directly; cross-module events pass asynchronously via BullMQ / Redis or public platform contracts.
4. **Encapsulated Database Access:** Database access is strictly encapsulated in `@suite/db`. `@suite/core` contains pure domain logic with **zero database dependencies**.
5. **Foundation Packages:** Infrastructure libraries (`@suite/db`, `@suite/redis`, `@suite/logger`) **NEVER** import higher-level domain packages.
6. **Zero Phantom Dependencies:** Every imported dependency must be declared in the package's local `package.json`.

---

## 5. Code Standards & Local Quality Gates

### Rule 5: Zero-Compromise Type Safety & Validation
- `strict: true` across all TypeScript compiler configurations.
- **Zero raw `any` types** and zero `@ts-ignore` bypasses.
- All network boundaries (REST endpoints, RPC parameters, BullMQ payloads) must be parsed and validated with **Zod**.
- **Type-Safe Environment Variables:** Every package and app validates its required environment variables at process boot; if any variable is missing or invalid, the process terminates immediately with an explicit error.
- **Env-First Pre-Declaration Law:** Every environment variable accessed in runtime code, configuration, scripts, or test utilities (`process.env.*`, `import.meta.env.*`) MUST be pre-declared and documented in root and package-level `.env.example` templates and local `.env` files with safe, intention-revealing default or placeholder values before being referenced in code. Referencing undeclared, undocumented, or phantom environment variables in code is strictly prohibited.

### Rule 5.1: Enterprise Clean Code & Refactoring Standards (Constitution Principle XII)
All code submitted to Business OS MUST comply with Constitution Principle XII:
1. **Function Decomposition & SLAP:** Functions must be small, cohesive, and operate at a single level of abstraction. Route handlers MUST NOT exceed 100 lines; helper functions MUST NOT exceed 30 lines. Complex orchestration must be extracted into dedicated domain services.
2. **Parameter Discipline & No Flag Arguments:** Limit positional parameters to $\le 2$. For 3+ parameters, pass a single typed options object with destructuring. Boolean flag parameters that split function behavior into two distinct branches are strictly prohibited.
3. **Naming & Domain Modeling:** Use intention-revealing, pronounceable, and searchable English names. Avoid cryptic abbreviations (`usrOrgRel`, `calcBDate`). Magic numbers and strings must be replaced by centralized, strongly typed `as const` constants. Prefer dedicated domain value objects with Zod validation over primitive obsession for core business concepts.
4. **Comment Hygiene:** Prefer self-documenting code over obvious comments. Commented-out dead code blocks and closing-brace comments (`// end if`) are strictly forbidden. Use comments exclusively to document non-obvious business invariants, architectural trade-offs, or race condition hazards.
5. **Source Code Structure:** Maintain vertical separation between distinct concepts and vertical proximity (declare variables near their use). Organize files in a top-down newspaper flow with public contracts at the top and low-level helpers below.
6. **Objects vs. Data Structures:** Strictly distinguish plain Data Transfer Objects (DTOs without behavior) from rich Domain Entities/Services (cohesive operations with encapsulated private state).
7. **Testing Excellence:** Follow the Arrange-Act-Assert (AAA) pattern with descriptive, intention-revealing test names. Each test MUST verify exactly one logical concept or business rule. Unit tests must be fast, in-memory, order-independent, and free of shared mutable state. Never weaken assertions or delete tests to force CI to pass.
8. **Error Handling & Resilience:** All exceptions must extend `AppError` and map to RFC 7807 problem details. Swallowing errors with empty `catch {}` blocks is strictly prohibited.
9. **Scoped Refactoring (The Boy Scout Rule):** Boy Scout cleanups (typos, typing fixes, renaming, dead code removal) are strictly bounded to the files within the active ticket's blast radius. Sweeping un-ticketed refactors across unrelated packages are strictly prohibited.
10. **Code Smell Monitoring:** Actively prevent and address rigidity, fragility, immobility, needless repetition, and opacity during code review.

### Rule 6: Mandatory Local Quality Gates
Before any commit or push is accepted, run the complete local gate:
```bash
pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test
```
All three checks must pass with zero errors.

---

## 6. Pull Request Lifecycle & The Human Approval Gate

### Rule 7: Pull Request Size Discipline (The Small PR Rule)
- Pull requests must be small, atomic, and focused (**< 400 lines of code changed**, excluding auto-generated lockfiles or database migrations).
- Large epics must be split into logical sub-tickets to ensure rigorous, fast code review.

### Rule 8: Mandatory CI Gates & THE HUMAN MERGE APPROVAL GATE
- Every PR triggers GitHub Actions Continuous Integration (`.github/workflows/ci.yml`):
  - ✅ **Lint:** `pnpm turbo run lint`
  - ✅ **Typecheck:** `pnpm turbo run typecheck`
  - ✅ **Automated Tests:** `pnpm turbo run test`
- **Conventional Commits:** All commits follow `type(scope): description (closes #X)` (e.g. `feat(logger): implement structured logging with pino v9 (closes #5)`).
- **THE MANDATORY HUMAN MERGE APPROVAL GATE:**
  - **AI AGENTS AND AUTOMATED TOOLS ARE STRICTLY FORBIDDEN FROM MERGING PULL REQUESTS AUTONOMOUSLY.**
  - When you finish coding a ticket:
    1. Run local gates: `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test`.
    2. Commit with Conventional Commits: `type(scope): description (closes #X)`.
    3. Push branch: `git push -u origin <branch-name>`.
    4. Open Pull Request targeting `dev`: `gh pr create --base dev ...`.
    5. Verify GitHub Actions CI turns **Green ✅**.
    6. **STOP. Present the PR link to the user, explain the changes, and WAIT FOR EXPLICIT WRITTEN APPROVAL (e.g. "Merge it" or "Approved").**
    7. Only execute `gh pr merge <num> --squash --delete-branch` AFTER human approval is given.
    8. **Post-Merge Integration Gate (P0 Stop-the-Line):** Immediately after merging, monitor and verify that `dev`'s post-merge GitHub Actions CI run turns **Green ✅**. If `dev` turns Red, **STOP ALL NEW WORK IMMEDIATELY** — resolving `dev` is P0 priority before picking up any new issue, creating any new branch, or writing any code.

---

## 7. Data Safety & Architecture Documentation

### Rule 9: Zero-Downtime Migration Policy (Expand-and-Contract)
- Destructive schema migrations (dropping columns, changing types in place) are prohibited on production schemas.
- Forward-only, timestamped SQL migrations applied via `prisma migrate deploy`.
- Running `prisma db push` on production or staging databases is strictly forbidden.
- All seed scripts must be idempotent (`upsert`), ensuring repeat runs never fail or corrupt state.
- DDL and data backfill MUST be separate migrations; a schema change never depends on a backfill completing in the same transaction.
- Migrations MUST set a `lock_timeout` and MUST create indexes on large tables concurrently.
- Every schema migration MUST ship its runtime role grants, revoke `PUBLIC`, and include a test proving the tenant identity cannot read control-plane tables.
- A schema change is one unit: schema file, schema tag, table prefix, registry entry, migration, grants and documentation.

### Rule 10: Architectural Decision Records (ADRs)
- Non-obvious architectural choices, library selections, or trade-offs must be documented as an ADR in `docs/adr/000X-title.md` covering: Context, Decision, Alternatives Considered, and Consequences.

---

## 8. AI Agent Operational Protocol & Absolute Guardrails

### Rule 11: The Agent's Mandatory 7-Step Cycle
When working on any ticket, the AI agent must strictly follow:
1. **Identify Issue:** Verify the assigned GitHub Issue number and pass/fail criteria via `gh issue list`.
2. **Branch from `dev`:** Create isolated branch `git checkout -b <type>/#<issue-num>-<slug> dev`.
3. **Verify Identity:** Ensure commits are attributed to `Rohit Bahuguna <rohitbahuguna.work@gmail.com>`.
4. **Implement Scope:** Write code strictly adhering to the issue scope and architecture specs.
5. **Local Verification:** Run `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test`.
6. **Push & Open PR:** Push branch and create PR targeting `dev` (`gh pr create --base dev ...`).
7. **Human Approval Gate & Merge:** Present PR to user. **Wait for explicit written user approval** before running `gh pr merge <num> --squash --delete-branch`.
8. **Post-Merge Integration Gate (P0 Stop-the-Line):** Immediately after merging, verify `dev`'s post-merge CI turns **Green ✅**. If `dev` breaks, all new work stops until `dev` is resolved.

### Rule 12: Architectural Quality Bar & Absolute Negative Constraints
You are **STRICTLY PROHIBITED** from:
- ❌ Merging any Pull Request without explicit human written approval.
- ❌ Direct pushing or force-pushing to `main`, `staging`, or `dev`.
- ❌ Using `@ts-ignore` or `any` to bypass TypeScript errors.
- ❌ Deleting or disabling failing tests to force CI to pass.
- ❌ Writing "TODO: add auth/security later" mock implementations.
- ❌ Hardcoding mock data in production route handlers.
- ❌ Bypassing tenant isolation (`organizationId` / `branchId`).
- ❌ Running `prisma db push` on production or staging databases (use forward-only migrations).
- ❌ Touching or modifying the live `river-view-homstay-lite` repository.
- ❌ Deleting or modifying `*.code-workspace` files (these define the active multi-root IDE workspace).
- ❌ Writing undocumented API endpoints: Every HTTP route **MUST** be registered with `@hono/zod-openapi`'s `createRoute()` with schemas for params, request body, and RFC 7807 problem details responses.
- ❌ Exposing `/doc` and `/openapi.json` without environment guards: Internal documentation must be protected or restricted in production.
- ❌ Consuming undeclared or phantom environment variables in code without pre-declaring them in `.env` and `.env.example` templates (Env-First Pre-Declaration Law).
- ❌ Hardcoding UI presentation strings, repetitive JSX input blocks, or static column definitions directly in component JSX/TSX (Config-Based UI Primacy Law). All navigation sidebars, dashboard layouts, settings tabs, card sections, forms, and data tables MUST be strictly declarative and driven by strongly typed configuration schemas (`*.config.ts`) and generic rendering engines (`<ConfigFormRenderer />`, `<ConfigTableRenderer />`). Freeform visual authoring canvases (such as Website Builder Studio Canvas) are the sole exception. Existing sidebars and dashboard views must be progressively migrated to this config-driven standard.
- ❌ Creating bloated, monolithic "bag-of-options" interfaces with multiple optional (`?`) fields to cover divergent variants or states (SOLID Interface Segregation & Anti-Bag-of-Options Law). When an entity, configuration, or payload has variants, engineers and AI agents MUST use discriminated unions where variant-specific properties are strictly mandatory (`options: FormFieldOption[]`, `dangerConfirmationSlug: string`), eliminating runtime defensive fallbacks (`options?.map`, `?? "CONFIRM"`). Broad interfaces must be decomposed into cohesive single-responsibility contracts (Identity, Presentation, Layout, Constraints, Authorization) and composed via inheritance or intersection.
- ❌ Hardcoding modular apps into static navigation arrays (Zero Hardcoded Modular App Nav Items Law). Static navigation files (`navigation.config.ts`) MUST contain strictly platform-level universal anchors (Overview, Settings). All modular apps (App 01 through App 12) MUST be loaded dynamically from the PostgreSQL database (`InstalledApp`) based on active tenant entitlements.

---

## 8.1 Rule 13: Definition of Done (Constitution XVII)

Every pull request MUST satisfy, and tick in the template:

1. **Requirement traceability:** the issue and PR name the requirement ids or rule ids implemented.
2. **Denial path:** authorization denial is tested, not only the success path.
3. **Audit:** every mutation asserts its audit record.
4. **Data standards:** time, money, identifiers, caching and reference data follow Constitution XVI where touched.
5. **Documentation:** the relevant document in `05-modular-apps/<app>/` is updated in the same change.
6. **Reversibility:** a rollback note, or the flag that gates the change.
7. **Observability:** new dependencies appear in health checks; new routes emit structured logs and metrics.
8. **Accessibility:** new screens pass the automated check and a keyboard path test.
9. **Terminology:** approved terms only; banned synonyms removed.
10. **Rules named:** the PR lists the rules applied, so review does not rely on memory.

A PR missing any item is not ready for review.

## 8.2 Rule 14: Data and Contract Standards (Constitution XVI)

- **Capabilities:** registry entry, enforcement point, denial test and documentation must exist together.
- **Versioning:** mutable aggregates carry a version; clients send the expected version; conflicts return 409.
- **Idempotency:** destructive or replayable mutations accept an idempotency key with a 24-hour replay window.
- **Pagination:** cursor-based, capped limit, stable sort key.
- **Error codes:** one typed registry, deterministic `/errors/<slug>` mapping, no literals at call sites.
- **Reference data:** database-owned catalogs, normalized and unique codes, retire rather than delete, no hardcoded option lists, propagation within 60 seconds.
- **Time:** UTC storage, branch-timezone rendering through `Intl`.
- **Money:** integer minor units or decimal, never floating point.
- **Identifiers:** cuid2 or ULID; no sequential ids in URLs.
- **Caching:** explicit key, TTL and invalidation trigger.

---

## 9. Versioning, Changesets & Feature Flags

### Semantic Versioning (SemVer) & Changesets:
- Changes are tracked using `@changesets/cli` in `.changeset/`.
- Merging to `dev` aggregates changesets.
- Promoting to `staging` generates pre-release versions (e.g. `v0.1.0-beta.1`).
- Promoting to `main` executes `changeset version`, bumping `package.json` versions and updating `CHANGELOG.md`.

### Feature Flags Architecture ("Deploy != Release"):
- Deploying code does not mean releasing it. New features are wrapped in feature flags.
- Evaluated in Redis in `< 0.2ms` with zero database overhead.
- Supports progressive rollout (Canary $\rightarrow$ 25% $\rightarrow$ 100%) and instant 1ms kill-switches.
- Every flag MUST declare an owner, creation date, expiry date, default-off state and a removal ticket. A flag without an expiry is a defect.
- Flag key naming follows `<domain>.<feature>.<variant>`; evaluation is deterministic and fails closed.
- Removing a flag is part of the release that makes it permanent; leaving dead flags is prohibited.

---

## 10. Specification References

Before implementing domain features, you **MUST** consult the authoritative specifications in `/home/rohit-bahuguna/RB/Composable_Business_Operating_System/`:
- **Architecture & Scaling:** `02-architecture-and-tech-stack/TECH_STACK_HLD_AND_SCALING_BLUEPRINT.md`
- **Platform Core DB Schema:** `03-platform-core/CORE_DATABASE_LLD_AND_ERD.md`
- **API & Event Contracts:** `03-platform-core/CORE_API_AND_EVENT_CONTRACTS.md`
- **Engineering Constitution:** `00-master-tracker/ENTERPRISE_ENGINEERING_STANDARDS_AND_PHILOSOPHY.md`
- **Sprint Implementation Backlog:** `04-monorepo-and-infrastructure/SPRINT_0_TASK_BREAKDOWN.md`
- **Monorepo Rules & Boundaries:** `04-monorepo-and-infrastructure/MONOREPO_RULES_STRUCTURE.md`
