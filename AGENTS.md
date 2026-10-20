# AGENTS.md — Mandatory AI Agent Operating Directives
## Universal Composable Business Operating System (Business OS)
### Target Workspace: /home/rohit-bahuguna/RB/business-os

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS (ANTIGRAVITY, CURSOR, CLAUDE, COPILOT):**  
> You are operating within an enterprise production monorepo governed by strict venture-backed engineering standards.  
> You **MUST NOT** behave like a junior coding assistant. Read and obey these directives on **EVERY SINGLE TURN**.

---

## 0. Rule 0: Pre-Change Rule Verification Gate (APPLY RULES FIRST BEFORE MAKING ANY CHANGES)
- **Before making ANY code, design, configuration, or architectural change, AI agents MUST explicitly review, verify, and apply ALL operational directives, architectural rules, and Clean Code standards FIRST.**
- AI agents are **STRICTLY PROHIBITED** from taking shortcuts, introducing temporary workarounds, using mock/static data fallbacks, or writing code before validating all repository rules.
- Every turn begins with a rule compliance check: If an action would violate ANY directive in this document or Constitution Principle XII (e.g., issue-first policy, zero static data, DESIGN.md primacy, clean code discipline, branch hierarchy, human issue approval gate, human commit & PR approval gate, human merge approval gate, core immutability, env-first pre-declaration), the agent **MUST NOT** proceed with the violation.

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

## 4. MANDATORY HUMAN COMMIT, PR & MERGE APPROVAL GATES

### 4.1 THE MANDATORY HUMAN COMMIT & PR APPROVAL GATE (NO AUTONOMOUS COMMITS OR PRS)
- **AI AGENTS ARE STRICTLY FORBIDDEN FROM COMMITTING CODE, PUSHING BRANCHES, OR RAISING/CREATING PULL REQUESTS AUTONOMOUSLY.**
- When you finish coding a ticket or task:
  1. Run local gates: `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test`.
  2. **STOP. DO NOT COMMIT OR PUSH.** Present a pre-commit report to the user specifying:
     - Exact modified and newly created files
     - Proposed Conventional Commit message: `type(scope): description (closes #X)`
     - Proposed Pull Request title and structured description
     - Local test and verification gate results
  3. **WAIT FOR EXPLICIT WRITTEN APPROVAL** from the user (e.g. "Commit and raise PR" or "Approved to commit").
  4. **Only execute `git commit`, `git push`, and `gh pr create` AFTER written approval is explicitly given.**

### 4.2 THE MANDATORY HUMAN MERGE APPROVAL GATE (NO AUTONOMOUS MERGES)
- **AI AGENTS ARE STRICTLY FORBIDDEN FROM MERGING PULL REQUESTS AUTONOMOUSLY.**
- After the Pull Request is created:
  1. Verify GitHub Actions CI turns **Green ✅** (unless user explicitly requests not to wait/track).
  2. **STOP. Present the PR link to the user, explain the changes, and WAIT FOR EXPLICIT WRITTEN APPROVAL (e.g. "Merge it" or "Approved").**
  3. Only execute `gh pr merge <num> --squash --delete-branch` AFTER explicit written human approval is given.
  4. **Post-Merge Integration Gate (P0 Stop-the-Line):** Immediately after merging, monitor and verify that `dev`'s post-merge GitHub Actions CI run turns **Green ✅**. If `dev` turns Red, **STOP ALL NEW WORK IMMEDIATELY** — resolving `dev` is P0 priority before picking up any new issue, creating any new branch, or writing any code.
  5. **Mandatory Issue Closure on PR Merge (Immediate Issue Closure Law):** Immediately after the PR is merged into `dev`, verify that the originating GitHub Issue (`#X`) is closed. Because merging into non-default branches does not always auto-close issues on GitHub, the AI agent MUST explicitly run `gh issue close <issue-num> -c "Resolved and closed by PR #<pr-num>."` immediately after merge so that no orphan open issues remain.

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
- ❌ Exposing `/doc` and `/openapi.json` without environment guards: Internal documentation must be protected or restricted in production.
- ❌ **Mutating Core Platform Models for Modular Apps (Core Domain Immutability Law):**
  When working on ANY modular app (App 01 through App 12):
  1. You are **STRICTLY FORBIDDEN** from modifying `packages/db/prisma/schema/core.prisma` or adding reverse relation fields (e.g. `cmsSites`, `posOrders`, `pmsBookings`) to `Organization`, `Branch`, `User`, `Role`, or any core platform model.
  2. Core platform models are **READ-ONLY** to modular app tickets.
  3. Modular schemas MUST live strictly in their own dedicated file: `packages/db/prisma/schema/<app-name>.prisma`.
  4. Multi-tenancy in modular apps is established strictly via scalar IDs (`organizationId String`, `branchId String?`) without declaring reverse Prisma relations in core models.
- ❌ **Orphan / Un-Namespaced Database Tables:** Every table belonging to a modular app MUST use its mandatory application namespace prefix in PostgreSQL (e.g. `cms_*`, `pos_*`, `pms_*`). Generic table names (`pages`, `orders`, `forms`) are strictly forbidden.
- ❌ **Hardcoded Styles & Off-Spec Design (DESIGN.md Primacy Law):**
  `DESIGN.md` (`/home/rohit-bahuguna/RB/Composable_Business_Operating_System/DESIGN.md`) is the **SINGLE SOURCE OF TRUTH** for all visual design, tokens, typography, layout, radii, motion, and theming.
  1. You are **STRICTLY FORBIDDEN** from hardcoding color names or arbitrary hex values (e.g. `text-slate-900`, `bg-indigo-600`, `border-blue-500`, `#ffffff`) in UI components or pages. Always reference semantic design tokens (`text-text`, `text-secondary`, `bg-surface`, `bg-action`, `border-border`, etc.).
  2. All global design tokens MUST live in `apps/dashboard/src/app/globals.css` (`:root`) and be mapped in `packages/ui/tailwind.preset.cjs`.
  3. Dark mode MUST strictly implement `colors-dark` from `DESIGN.md` §9.
  4. Per-app customizations MUST live exclusively in single-file app-scoped overrides (`[data-app="<app-name>"]`).
- ❌ **Static Mock Data & In-Memory Fallback Stores (Zero Static Data Law):**
  You are **STRICTLY FORBIDDEN** from introducing static mock data, hardcoded fallback entity arrays (such as hardcoded app lists, fake sites, mock tenants, demo templates, or dummy credentials), or in-memory mutable state stores (`new Map()`, module-scoped mock variables) anywhere in runtime production code.
  1. All domain entities, installed modular apps, navigation items, and tenant records **MUST** be fetched dynamically from the PostgreSQL database (`@suite/db`) or official REST/RPC APIs.
  2. If data is absent or an error occurs, UI components MUST render genuine empty states or RFC 7807 problem details—**NEVER** fall back to hardcoded mock datasets or fake in-memory fixtures.
  3. **Zero Hardcoded Modular App Nav Items:** Navigation configuration files (`navigation.config.ts`, etc.) MUST strictly declare ONLY universal platform core anchors (e.g. Overview, Settings). Modular apps (App 01 through App 12) MUST NEVER be hardcoded into static navigation arrays. All modular app navigation items MUST be resolved dynamically at runtime from the tenant's database entitlements (`InstalledApp` / `@suite/db`).
- ❌ **Autonomous Database Seeding or Data Mutation (Human Seeding Gate):**
  AI agents are **STRICTLY FORBIDDEN** from running `prisma db seed`, executing destructive database resets (`prisma migrate reset`), or executing database mutation scripts without explicit written user approval. Seeding introduces unexpected state resets and disrupts live development databases.
- ❌ **Exporting Shared Constants/Data from Client Components (RSC Boundary Law):**
  AI agents MUST NEVER define or export shared constants, default arrays, configurations, or schemas from files containing the `"use client"` directive if they are consumed by React Server Components (`layout.tsx`, `page.tsx`).
  All shared constants, fallback anchors (e.g. `BASE_NAV_ITEMS`), and data structures MUST reside in pure TypeScript modules (`types.ts`, `constants.ts`) without the `"use client"` directive to prevent runtime `undefined` bundle proxy errors.
- ❌ **Bloated & Monolithic Interfaces (SOLID Interface Segregation & Anti-Bag-of-Options Law):**
  AI agents and developers are **STRICTLY FORBIDDEN** from bundling unrelated, orthogonal domain concerns or creating "bag-of-options" interfaces stuffed with multiple optional (`?`) properties to cover divergent use-cases, entity variants, or configuration modes.
  1. **Zero Optional Field Accumulation:** An interface MUST NOT use optional properties (`field?: Type`) to represent properties that are only meaningful for specific variants, modes, or subtypes (e.g. putting `options?: FormFieldOption[]` or `dangerConfirmationSlug?: string` onto a general configuration interface).
  2. **Mandatory Discriminated Unions over Optional Bags:** When an entity, configuration, or payload has variants (such as field types, action confirmation levels, or section kinds), engineers MUST declare discriminated unions (`StandardFormFieldConfig | SelectFormFieldConfig`, `StandardFormSection | DangerZoneFormSection`) where variant-specific properties are strictly **mandatory** (`options: FormFieldOption[]`, `dangerConfirmationSlug: string`).
  3. **Zero Defensive Fallbacks:** Code MUST rely on compiler-guaranteed discriminated types rather than runtime defensive fallbacks (`options?.map(...)`, `slug ?? "CONFIRM"`). If a property is required for a variant to function, it must be required by the type system.
  4. **Cohesive Atomic Interfaces (ISP & SRP):** Every domain interface MUST follow the **Single Responsibility Principle (SRP)** and **Interface Segregation Principle (ISP)** by encapsulating only one cohesive domain context (e.g., `FieldIdentity`, `FieldPresentation`, `FieldLayout`, `FieldConstraints`, `FieldAuthorization`, `UserIdentityContext`, `TenantSessionContext`).
  5. **Composition over Monoliths:** Composite payloads MUST be assembled using multiple interface inheritance (`interface SessionPayload extends UserIdentityContext, ...`) or union discriminators.
  6. **Component Props Segregation:** Component prop interfaces MUST cleanly segregate header metadata, layout slots, event callbacks, and state into independent interfaces.
- ❌ **Scattered Host Environment Checks (Centralized Environment Guard Law):**
  AI agents are **STRICTLY FORBIDDEN** from scattering raw `typeof window !== "undefined"` or `typeof document !== "undefined"` checks throughout component code.
  1. All runtime host environment detection MUST be centralized in `lib/env.ts` (exporting `isBrowser`, `isServer`).
  2. Components and client utilities MUST import and use `isBrowser` / `isServer` directly for readable, maintainable SSR guards.
- ❌ **Floating Elements Outside Envelope Cards (Complete Card Encapsulation & Zero-Scroll Law):**
  1. All visual elements of an authentication or modal card (branding emblems, application titles, subtitles, badges, form controls, OAuth provider buttons, passkey triggers, and secondary navigation links like "Sign up" or "Sign in") MUST be encapsulated strictly **inside** the card container (`AuthCard`). Floating text or external wrappers outside the card are strictly forbidden.
  2. Superfluous external trust badges (such as "TLS Encrypted", "Zero-Trust Gate", "Kernel Tenant Isolated") MUST NOT be added.
  3. The card layout MUST maintain a compact vertical rhythm so that on a standard desktop/laptop viewport at 100% zoom, the complete card is visible with **zero vertical scrolling**. Natural vertical scrolling must only engage when the viewport height is reduced below the card height.
- ❌ **Tall Vertically-Stacked Popups & Screen-Edge Touching (Standardized Wide-Rectangle Modals & Popups Law):**
  AI agents and developers are **STRICTLY FORBIDDEN** from creating tall, narrow popups or vertically stacking multiple input sections that touch or overflow the top and bottom screen edges, or trigger vertical page scrolling on desktop/laptop viewports.
  1. Every modal dialog, popup, and centered auth/invitation card MUST follow the standardized wide-rectangular layout standard established in branch, member, and invite modals (`size="xl"`, `max-w-2xl` to `max-w-3xl`).
  2. Multi-field forms and attribute displays MUST leverage horizontal width using multi-column responsive grids (`grid grid-cols-1 sm:grid-cols-2` or `sm:grid-cols-4`).
  3. All popups and dialogs MUST maintain generous breathing margins (minimum 24px-32px padding/margin from screen edges) and compact vertical rhythm (`p-4` or `p-5`, `gap-3`).
  4. On a standard desktop/laptop viewport at 100% zoom, the entire popup/modal/card MUST fit comfortably on screen with **zero vertical scrolling**. Natural vertical scrolling (`overflow-y-auto`) inside the body container MUST strictly serve as a responsive safeguard for low-height mobile viewports only.
- ❌ **Unnecessary Form Inputs for Deterministic Data (Minimalist Input Law):**
  Do NOT demand user inputs for fields that can be deterministically derived. On initial sign up / registration, do NOT demand a "Full Name" field if the user's name can be automatically derived from the email address local-part. The backend MUST dynamically derive fallback display names.
- ❌ **Blocking Public Auth Routes in Edge Middleware (Public Auth Whitelist Law):**
  When creating or refactoring authentication routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`), Edge middleware MUST explicitly whitelist them in `isAuthRoute` to prevent unauthenticated users from encountering redirect loops (`307` back to `/login`).
- ❌ **Hardcoded Static Role Names (Pure Capability-Based Authorization Law):**
  Role names (e.g. `"owner"`, `"admin"`, `"Organization Owner"`, `"Branch Manager"`, or any slug from the database) are human-readable, mutable database records and organizational titles—**never** security capabilities. A role title alone does not grant permissions; specific permissions are mapped to roles dynamically via database relation (`role_permissions`).
  1. AI agents and developers are **STRICTLY PROHIBITED** from hardcoding role checks (e.g., `role === "owner"`, `role === "admin"`, `dbRoleSlug === "Organization Owner"`) in route handlers, middleware, service classes, RPC procedures, or UI components.
  2. All authorization gates **MUST be 100% capability-driven**, querying whether the authenticated actor possesses the required capability/action (e.g., `hasPermission(claims, PERMISSIONS.APPS.INSTALL)`).
  3. Even system-level superusers or tenant owners must be evaluated via permission claims (such as universal wildcard `*` or domain-scoped wildcards `apps:*`) resolved dynamically from their assigned permissions in PostgreSQL or verified session claims.
- ❌ **Scattered Raw String Literals (Canonical Domain Constants Law):**
  Scattering raw string literals ("primitive obsession") across routes, components, middleware, and tests causes typo regressions, diverging nomenclatures, breaking refactors, and silent security authorization failures.
  1. AI agents and developers are **STRICTLY PROHIBITED** from using ad-hoc raw string literals in runtime code for domain constants (such as RBAC permission codes, audit event types, event topics, status discriminators, error codes, and cookie/header keys).
  2. Every domain string that is referenced, evaluated, or assigned across multiple places **MUST** reside in a centralized, strongly-typed, immutable (`as const`) constant registry in the appropriate shared package (e.g. `PERMISSIONS` in `@suite/core`, `SESSION_COOKIE_NAME` in `@suite/auth`).
  3. All consuming packages, modular apps, routes, and unit/integration tests **MUST** import and consume these canonical constants directly.
- ❌ **Monolithic Route Handlers & Giant Functions (Function Decomposition Law):**
  Writing monolithic functions or route handlers that mix input validation, database access, business orchestration, and response formatting in single files is strictly forbidden.
  1. Route handlers MUST NOT exceed 100 lines; helper functions MUST NOT exceed 30 lines.
  2. Complex orchestration MUST be factored into dedicated domain services.
  3. Functions MUST adhere to the Single Level of Abstraction Principle (SLAP) and take $\le 2$ positional parameters (3+ MUST be passed as a single typed options object).
- ❌ **Boolean Flag Arguments (API Bifurcation Law):**
  Functions MUST NOT accept boolean flag parameters that split internal execution into two distinct operational modes (e.g., `processPayment(isRefund: boolean)`). Split into separate, intention-revealing functions (`processPayment()`, `processRefund()`).
- ❌ **Cryptic Abbreviations & Magic Literals (Intention-Revealing Naming Law):**
  Using unsearchable abbreviations (`usrRel`, `calcBDate`), vague identifiers (`data`, `temp`, `info`), or raw numeric/string magic constants deep in business logic is strictly forbidden. All constants MUST be named and registered in strongly-typed `as const` constants.
- ❌ **Redundant & Obsolete Comments (Comment Hygiene Law):**
  1. Comments that merely restate what code does (`// set user id`, `// return response`) are strictly forbidden.
  2. Leaving commented-out dead code blocks is strictly prohibited; rely on Git version history.
  3. Closing-brace comments (`// end of if`, `// end class`) are strictly forbidden.
  4. Comments are reserved strictly for non-obvious business invariants, architectural trade-offs, or hazardous race conditions.
- ❌ **Conflating DTOs with Domain Entities (Data Encapsulation Law):**
  Engineers and AI agents MUST maintain a strict separation between Data Transfer Objects (plain TypeScript types carrying boundary data without behavior) and Domain Entities/Services (cohesive abstractions encapsulating business logic while keeping mutations private).
- ❌ **Fragile & Coupled Test Design (Testing Excellence Law):**
  1. Each test MUST verify exactly one logical concept or business outcome (AAA pattern: Arrange-Act-Assert). Multiple assertions are permitted only when verifying different facets of that single logical outcome.
  2. Tests MUST be independent of execution order and shared mutable state.
  3. Weakening assertions, disabling tests, or using `@ts-ignore` in tests to force CI to pass is strictly prohibited.
- ❌ **Swallowed Exceptions & Empty Catch Blocks (Zero Swallowed Errors Law):**
  AI agents and developers are **STRICTLY FORBIDDEN** from introducing empty `catch {}` blocks or silently ignoring failures. All exceptions must either be handled cleanly with appropriate recovery/logging or rethrown as typed `AppError` subclasses.
- ❌ **Un-Scoped Sweeping Refactors (Strict Boy Scout Blast Radius Law):**
  Under the Boy Scout Rule, cleanup (fixing typos, improving variable names, typing fixes) MUST be strictly bounded to files in the active ticket's blast radius. Sweeping refactors across unrelated modules or packages without an explicit ticket are strictly forbidden.
- ❌ **Undeclared & Phantom Environment Variables (Env-First Pre-Declaration Law):**
  AI agents and engineers are **STRICTLY FORBIDDEN** from consuming, accessing, or introducing any environment variable (`process.env.*`, `import.meta.env.*`) in runtime code, configuration, scripts, or test utilities without **FIRST** pre-declaring and documenting it in the root and package-level `.env.example` templates and local `.env` files with safe, intention-revealing default or placeholder values. Referencing undeclared, undocumented, or phantom environment variables is strictly prohibited.
- ❌ **Hardcoded UI Presentation & Repetitive Markup (Config-Based UI Primacy Law):**
  Except for freeform visual authoring canvas engines (such as the Website Builder Studio Canvas), all user interface presentation throughout Business OS—including navigation sidebars, dashboard layouts, settings tabs, card sections, forms, and data tables—MUST be strictly declarative and driven by strongly-typed configuration schemas (`*.config.ts`).
  1. AI agents and developers are **STRICTLY PROHIBITED** from hardcoding raw UI presentation strings, repetitive JSX input blocks, or static column definitions directly inside component JSX/TSX.
  2. All form fields, input types, labels, descriptions, placeholders, default values, validation rules (Zod), and capability permission guards MUST be codified in dedicated configuration schemas and rendered dynamically via reusable generic schema engines (`<ConfigFormRenderer />`, `<ConfigTableRenderer />`) consuming standardized `@suite/ui` primitives.
  3. Navigation hierarchies (including the primary installed apps sidebar and the settings sub-navigation sidebar) MUST be generated from typed navigation configuration schemas where each node declares its icon, route, label, badge, and required RBAC permission.
  4. Data tables MUST derive columns, header labels, cell formatters, and row action triggers from typed table configuration schemas.
  5. The primary dashboard sidebar and all existing dashboard views MUST be progressively migrated to this config-driven standard.
- ❌ **Defensive Cascading Fallbacks & Heuristic Guessing (Deterministic Registry Law):**
  AI agents and developers are **STRICTLY PROHIBITED** from using cascading `||` or heuristic guessing chains (e.g. `ICONS[category.icon] || ICONS[category.id] || BuildingIcon`, `item.name || item.title || item.appId`, or falling back across divergent object fields) to resolve assets, icons, titles, or presentation components.
  1. Every domain entity and configuration item must declare its canonical key, and lookup must be deterministic via strongly-typed registries (`ICON_REGISTRY`, `getNavIcon()`, `getSettingsIcon()`) that fail loudly if an unregistered key is supplied.
  2. We do not guess at runtime; the system must know in advance and declare exactly what and where it will render.
- ❌ **Fail-Open Authorization Flaws (Strict Fail-Closed Permission Gate Law):**
  In any capability or authorization evaluation (UI navigation items, action buttons, route handlers, middleware), missing, null, or empty permissions context (`userPermissions === undefined || userPermissions.length === 0`) **MUST STRICTLY DENY ACCESS** (`return false`) whenever a capability requirement is present.
  1. Returning `true` or granting non-restricted fallback access when a permission is required but permissions context is omitted (`if (!userPermissions) return true;`) is a critical security vulnerability and is strictly forbidden.
  2. Unrestricted access is permitted ONLY for platform anchors that explicitly declare zero permission requirement (`!item.permission`).
- ❌ **Runtime Layout Array Partitioning & Negative ID Filtering (Pure Config Layout Law):**
  1. UI navigation components (such as `SidebarNav`) **MUST NOT** perform runtime heuristic filtering or array partitioning (e.g. `items.filter(item => item.id !== "settings")` or `items.filter(item => item.href.startsWith("/settings"))`) to separate layout sections (such as top items vs bottom pinned items). Layout sectioning must be codified directly in strongly-typed configurations (`NavigationConfig.topItems`, `NavigationConfig.bottomItems`) and consumed declaratively.
  2. Components MUST NOT filter collections by checking against hardcoded negative string IDs (e.g. `item.id !== "home" && item.id !== "settings"`). Dynamic domain collections (such as installed apps) must be managed and passed as distinct, dedicated typed arrays (`InstalledAppNavInput[]`), completely separated from baseline platform core anchors.
- ❌ **Scattered Pathname Matching & Fragile Navigation Hub Detection (Declarative Navigation Hub State Law):**
  Sidebar collapsing, sub-navigation rendering, and layout modes **MUST NOT** rely on raw ad-hoc pathname substring matching scattered across components (e.g. `pathname?.startsWith("/settings")`).
  Active hub detection must be centralized in declarative helper functions (e.g. `isSettingsHubRoute(pathname)`) exported from dedicated configuration modules.
- ❌ **Nested Ternary Operators in Render Logic (Clean Route Matching & Cognitive Clarity Law):**
  Chaining nested ternary operators (`a ? b : c ? d : e`) in JSX, component bodies, or routing logic is strictly forbidden.
  Route activation detection and complex status determinations must reside in dedicated, single-responsibility helper functions (`isRouteActive(currentPath, itemHref)`) adhering to SLAP, handling exact matches and sub-routes cleanly without nested ternary chains.
- ❌ **Static Role String Assignment & Autonomous Bypass (Sign-up / Tenant Bootstrap Capability Seeding Law):**
  As soon as a user signs up and provisions an organization, all canonical capability permissions from PostgreSQL must be immediately linked to the tenant's administrative role via database relation (`role_permissions`).
  Routes, session encoders, and middleware must NEVER assign hardcoded role strings (`role: "owner"`) or wildcard capabilities (`permissions: ["*"]`) as static fallbacks. All permissions must be resolved dynamically from PostgreSQL relations via `extractEffectivePermissions`.
- ❌ **Open String Registries (Exhaustive Compile-Time Mapped Types Law):**
  Registries mapping system identifiers, modular app IDs, route keys, or category icons MUST NOT be typed as open string dictionaries (`Record<string, ...>`).
  1. All keys must be defined as `as const` string tuples (`CANONICAL_NAV_ICON_KEYS`, `CANONICAL_SETTINGS_CATEGORY_KEYS`).
  2. Registries MUST be typed as exhaustive mapped types (`Record<NavIconKey, IconComponent>`). If a new modular app or category is added to the system, the TypeScript compiler (`tsc --noEmit`) MUST fail at compile time until its corresponding entry is registered.
  3. Runtime lookups from external/DB data MUST be protected by type guards (`isKnownNavIconKey(key)`).
- ❌ **Deprecation Scaffolding & Residue (Immediate Dead Code Deletion Law):**
  When introducing a new replacement prop, data model, or schema (such as `initialInstalledApps` replacing `initialNavItems`), engineers and AI agents MUST completely remove the superseded prop, its legacy filtering logic, and any associated dead code in the same change.
  Introducing temporary "backward compatibility" bridges or dual-path state initializers in the same component is strictly forbidden unless explicitly requested in a numbered migration issue.
- ❌ **ESLint-Enforced Zero Empty Catch Blocks (Strict Error Transparency Law):**
  Empty `catch {}` blocks are completely banned across the monorepo via ESLint (`"no-empty": ["error", { "allowEmptyCatch": false }]`).
  Every catch block must either handle the exception with domain recovery, log the error with typed context via `@suite/logger` or `console.error`, or rethrow as a typed `AppError` subclass.
- ❌ **Hardcoded Domain & Form Defaults (Dynamic Attribute & Canonical Constants Law):**
  AI agents and engineers are **STRICTLY FORBIDDEN** from hardcoding magic domain defaults or fallback values (e.g., `timezone: "Asia/Kolkata"`, `currency: "INR"`, `nightAuditHour: 4`, `locale: "en-IN"`, `dateFormat: "YYYY-MM-DD"`, `timeFormat: "12h"`, `capabilities: ["lodging"]`, `parentBranchId: ""`) in client state, component forms, or API route fallbacks.
  1. Default values for operational entities (such as branches, outlets, or pos profiles) **MUST** be derived dynamically from the active tenant/organization profile (`activeOrganization.timezone`, `activeOrganization.currency`, `activeOrganization.locale`) or canonical platform configuration constants.
  2. Fallback options for parent hierarchies or relations must be loaded dynamically from the database or passed via typed context props—never hardcoded as static in-component arrays (`[{ label: "None...", value: "" }]`).
- ❌ **Masked & Generic Error Messages (Transparent RFC 7807 Error Presentation Law):**
  AI agents and developers are **STRICTLY FORBIDDEN** from displaying generic catch-all toast notifications or error banners (such as `toast.error("Network error while updating branch.")`) that mask the underlying server error or validation details.
  1. All HTTP error handling in client services and components MUST parse RFC 7807 problem details payloads (`detail`, `title`, and `invalidParams` / Zod issues) and present the genuine backend error reason to the user.
  2. If a non-RFC network error occurs, the actual exception message must be formatted transparently rather than replaced with a generic boilerplate string.
- ❌ **Custom Ad-Hoc Modal Forms (Declarative Modal & Form Schema Primacy Law):**
  Except for the freeform website builder canvas, all modal forms (including creation, editing, and confirmation dialogs) **MUST NOT** be hand-crafted with custom, repetitive JSX input markup inside feature components.
  1. Form fields, input controls, section groupings, validation rules (Zod), and layout grids MUST be declared in strongly-typed configuration schemas (`*.config.ts`).
  2. Modals MUST render these schemas through reusable config-driven form engines (`<ConfigFormRenderer />`) consuming `@suite/ui` primitives.
- ❌ **Monolithic Multi-Concern Feature Components (Sub-Component Segregation Law):**
  AI agents and developers are **STRICTLY FORBIDDEN** from cramming the primary listing table, filter toolbar, add modal, edit modal, and danger confirmation dialog into a single monolithic client component (>150 lines).
  1. Directory views MUST be cleanly decomposed into atomic, single-responsibility sub-components (e.g. `BranchTableToolbar`, `BranchFormModal`, `BranchDangerModal`) housed in a dedicated sub-components directory.
  2. The parent orchestrator component is responsible solely for state coordination and data fetching.
- ❌ **Runtime Navigation Partitioning & Hardcoded Group Headers (Declarative Navigation Grouping Law):**
  Navigation sidebars and sub-navigation menus (including Settings Navigation) **MUST NOT** partition categories at runtime using heuristic ID arrays (e.g., `categories.filter(c => c.id === "general" || ...)`).
  1. All category groupings (e.g. "Workspace", "Access & Security") MUST be declared directly in navigation configuration schemas (`settings.config.ts`, `navigation.config.ts`).
  2. Section headers and group titles MUST NOT be hardcoded string literals in JSX; they must be rendered dynamically from configuration properties (`group.label`).
- ❌ **Inaccessible Navigation Sizing & Missing Active Highlights (Navigation Usability & Visual Clarity Law):**
  Navigation items in both sub-navigation sidebars and the primary app sidebar MUST provide comfortable, accessible touch targets (`py-2` or `h-9` minimum height) and MUST render a subtle background highlight (`bg-surface-hover` / `bg-surface-subtle`) in active states in addition to the left accent bar indicator.

---


## 5.1 Pre-Execution Blast Radius Gate
Before asking human approval to start ANY issue, the agent MUST explicitly state the **Blast Radius**:
1. *Will this issue touch or modify any shared core package (`@suite/core`, `@suite/auth`, or `schema/core.prisma`)?* (Must be NO for modular app tickets).
2. *Does this issue introduce any reverse dependency from Core to Module?* (Must be NO).
3. *What exact new files will be created and which existing files will be touched?*

---

## 6. Specification References
Before implementing domain features, you **MUST** consult the authoritative specifications in `/home/rohit-bahuguna/RB/Composable_Business_Operating_System/`:
- **Design System & Visual Tokens (Single Source of Truth):** `DESIGN.md`
- **Architecture & Scaling:** `02-architecture-and-tech-stack/TECH_STACK_HLD_AND_SCALING_BLUEPRINT.md`
- **Platform Core DB Schema:** `03-platform-core/CORE_DATABASE_LLD_AND_ERD.md`
- **API & Event Contracts:** `03-platform-core/CORE_API_AND_EVENT_CONTRACTS.md`
- **Engineering Constitution:** `00-master-tracker/ENTERPRISE_ENGINEERING_STANDARDS_AND_PHILOSOPHY.md`
- **Sprint Implementation Backlog:** `04-monorepo-and-infrastructure/SPRINT_0_TASK_BREAKDOWN.md`
