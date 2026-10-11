# AGENTS.md — Mandatory AI Agent Operating Directives
## Universal Composable Business Operating System (Business OS)
### Target Workspace: /home/rohit-bahuguna/RB/business-os

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS (ANTIGRAVITY, CURSOR, CLAUDE, COPILOT):**  
> You are operating within an enterprise production monorepo governed by strict venture-backed engineering standards.  
> You **MUST NOT** behave like a junior coding assistant. Read and obey these directives on **EVERY SINGLE TURN**.

---

## 1. Identity & Git Committer Configuration
All Git actions, commits, and PRs in this repository **MUST** use this developer identity:
- **Author Name:** `Rohit Bahuguna`
- **Author Email:** `rohitbahuguna.work@gmail.com`
- **SSH Remote Host:** `github-personal` (configured in `~/.ssh/config` using `~/.ssh/personal`)
- **Git Push Remote:** `origin` (`git@github-personal:business-os-systems/business-os.git`)
- Local overrides are stored in `.developer.identity.json` (gitignored).

---

## 2. Rule 1: Strict Issue-First Policy & Mandatory Human Issue Approval Gate (NO TICKET = NO CODE)
- **You are STRICTLY FORBIDDEN from writing code, editing files, creating branches, or committing without an active, numbered GitHub Issue (`#X`).**
- **MANDATORY HUMAN ISSUE APPROVAL GATE:**
  - AI agents are **STRICTLY FORBIDDEN from autonomously creating GitHub issues or milestones**.
  - Before creating ANY GitHub issue (for a new sprint, feature, bugfix, or chore):
    1. The agent **MUST ask the user first** and present the proposed issues in a **clear tabular view** specifying:
       - Proposed Ticket Code & Title
       - Meaning & Architectural Purpose (what it actually means/does)
       - Target Package / File Paths
       - Prerequisites & Priority
    2. The agent **MUST WAIT for explicit written approval** from the user before executing `gh issue create` or provisioning any milestone.
  - Only after the user confirms the plan and explicitly approves the issue list may the agent provision them on GitHub.
- Before doing ANY work:
  1. Check open issues using `gh issue list --repo business-os-systems/business-os`.
  2. If an approved ticket does not exist for the work requested, follow the Human Issue Approval Gate above.
  3. Only then proceed to create the branch.

---

## 3. Branching & 3-Tier Promotion Pipeline
- **Branch Hierarchy:**
  - `dev`: Active integration branch. **ALL feature work branches from and targets `dev`.**
  - `staging`: Pre-release / Beta environment for QA and night audit rollover tests.
  - `main`: Live production environment for paying customers.
- **Branch Naming Standard:**
  ```bash
  git checkout -b <type>/#<issue-number>-<short-kebab-slug> dev
  ```
  - Features: `feat/#3-platform-db-schema dev`
  - Bug Fixes: `fix/#12-tenant-isolation-leak dev`
  - Chores: `chore/#14-add-agents-md dev`
- **Protected Branches:** Direct pushes and force-pushes to `main`, `staging`, or `dev` are strictly prohibited.

---

## 4. THE MANDATORY HUMAN MERGE APPROVAL GATE
- **AI AGENTS ARE STRICTLY FORBIDDEN FROM MERGING PULL REQUESTS AUTONOMOUSLY.**
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

## 5. Architectural Quality Bar & Absolute Negative Constraints
You are **STRICTLY PROHIBITED** from:
- ❌ Using `@ts-ignore` or `any` to bypass TypeScript errors.
- ❌ Writing "TODO: add auth/security later" mock implementations.
- ❌ Deleting or disabling failing tests to force CI to pass.
- ❌ Bypassing tenant isolation (`organizationId` / `branchId`).
- ❌ Running `prisma db push` on production or staging databases (use forward-only migrations).
- ❌ Touching or modifying the live `river-view-homstay-lite` repository.
- ❌ Deleting or modifying `*.code-workspace` files (these define the active multi-root IDE workspace).
- ❌ Writing undocumented API endpoints: Every HTTP route **MUST** be registered with `@hono/zod-openapi`'s `createRoute()` with schemas for params, request body, and RFC 7807 problem details responses.
- ❌ **Mutating Core Platform Models for Modular Apps (Core Domain Immutability Law):**
  When working on ANY modular app (App 01 through App 12):
  1. You are **STRICTLY FORBIDDEN** from modifying `packages/db/prisma/schema/core.prisma` or adding reverse relation fields (e.g. `cmsSites`, `posOrders`, `pmsBookings`) to `Organization`, `Branch`, `User`, `Role`, or any core platform model.
  2. Core platform models are **READ-ONLY** to modular app tickets.
  3. Modular schemas MUST live strictly in their own dedicated file: `packages/db/prisma/schema/<app-name>.prisma`.
  4. Multi-tenancy in modular apps is established strictly via scalar IDs (`organizationId String`, `branchId String?`) without declaring reverse Prisma relations in core models.
- ❌ **Orphan / Un-Namespaced Database Tables:** Every table belonging to a modular app MUST use its mandatory application namespace prefix in PostgreSQL (e.g. `cms_*`, `pos_*`, `pms_*`). Generic table names (`pages`, `orders`, `forms`) are strictly forbidden.

---

## 5.1 Pre-Execution Blast Radius Gate
Before asking human approval to start ANY issue, the agent MUST explicitly state the **Blast Radius**:
1. *Will this issue touch or modify any shared core package (`@suite/core`, `@suite/auth`, or `schema/core.prisma`)?* (Must be NO for modular app tickets).
2. *Does this issue introduce any reverse dependency from Core to Module?* (Must be NO).
3. *What exact new files will be created and which existing files will be touched?*

---

## 6. Specification References
Before implementing domain features, you **MUST** consult the authoritative specifications in `/home/rohit-bahuguna/RB/Composable_Business_Operating_System/`:
- **Architecture & Scaling:** `02-architecture-and-tech-stack/TECH_STACK_HLD_AND_SCALING_BLUEPRINT.md`
- **Platform Core DB Schema:** `03-platform-core/CORE_DATABASE_LLD_AND_ERD.md`
- **API & Event Contracts:** `03-platform-core/CORE_API_AND_EVENT_CONTRACTS.md`
- **Engineering Constitution:** `00-master-tracker/ENTERPRISE_ENGINEERING_STANDARDS_AND_PHILOSOPHY.md`
- **Sprint Implementation Backlog:** `04-monorepo-and-infrastructure/SPRINT_0_TASK_BREAKDOWN.md`
