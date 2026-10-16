<!--
SYNC IMPACT REPORT
- Version change: 1.3.0 -> 1.4.0 (ratification of Principle XII: Enterprise Clean Code & Refactoring Discipline)
- List of modified principles:
  - Added Principle XII: Enterprise Clean Code & Refactoring Discipline covering general rules, design/boundaries, understandability, naming, functions, comments, structure/formatting, objects vs data structures, testing, and code smells.
- Added sections / subsections:
  - Principle XII.1 through XII.10
- Removed sections:
  - None.
- Follow-up TODOs:
  - None.
-->

# Business OS Constitution

## Core Principles

### I. Composable Modular Architecture & Decoupled Apps
Every modular business software capability ("app") MUST be built as a self-contained, independent workspace library inside `packages/modules/<app-slug>`. Modular apps MUST remain completely decoupled from one another: direct cross-app imports (such as importing from `packages/modules/restaurant-pos` inside `packages/modules/lodging-pms`) are STRICTLY FORBIDDEN. Every modular app MUST implement and expose an `IPlatformApp` manifest declaring its unique `id`, `name`, `version`, `category`, required permissions, back-office navigation items, managed database models, published CMS visual blocks, and inter-module event listeners and emitters. Cross-module communication MUST occur exclusively through asynchronous domain events or typed shared contracts and ports exposed by `@suite/core`.
*Rationale: Decoupling enables modular applications to be built, tested, versioned, installed, and uninstalled in complete isolation without introducing brittle dependencies, breaking side effects, or cascading regressions across unrelated business domains.*

### II. Dynamic Entitlement & Zero-Bloat Tenant Packaging
The operating system MUST function as a composable, à-la-carte business suite where end tenants only receive, load, and pay for the exact set of modular apps required by their business. Application entitlement MUST be dynamically resolved from the PostgreSQL database via `InstalledApp` (organization level) and `AppBranchConfig` (branch level). Host applications (`apps/dashboard`, `apps/api`, `apps/web`) MUST query database entitlements at runtime to dynamically mount routes, navigation items, and workspace views. If a business subscribes to only two apps, runtime execution MUST load only those two apps; uninstalled modules MUST NOT inject dead assets, unused routes, or computational overhead into that tenant's workspace.
*Rationale: Business users must never be forced to carry or pay for monolithic software bloat they do not need. Dynamic packaging ensures lightweight, high-performance runtime isolation tailored to each customer.*

### III. Core Domain Immutability & Database Namespacing
Platform core models defined in `packages/db/prisma/schema/core.prisma` (including `Organization`, `Branch`, `User`, `Role`, and `Session`) are PERMANENTLY IMMUTABLE and READ-ONLY during modular app development. Engineers and AI agents are STRICTLY FORBIDDEN from adding reverse relations (e.g. `cmsSites`, `posOrders`, `pmsBookings`) to core models. Modular schemas MUST reside exclusively in dedicated schema files (`packages/db/prisma/schema/<app-name>.prisma`) and connect to core entities solely via indexed scalar foreign keys (`organizationId String`, `branchId String?`). Furthermore, every database table belonging to a modular app MUST carry its official application namespace prefix (e.g. `cms_*`, `pos_*`, `pms_*`). Generic, un-namespaced table names (`pages`, `orders`, `forms`) are strictly prohibited.
*Rationale: Eliminating reverse relations and enforcing table namespaces prevents schema coupling, prevents migration collisions across parallel feature teams, and ensures modular apps can be detached without breaking the platform core.*

### IV. Hexagonal Facades & Event-Driven Interoperability
Application modules and business handlers are STRICTLY FORBIDDEN from directly importing external third-party SDKs, vendor APIs, hardware drivers, cloud SDKs, or raw third-party icon libraries. All external capabilities MUST be accessed through internal domain-owned Ports (TypeScript interfaces) housed in platform packages (`@suite/ui/icons`, `@suite/payments`, `@suite/media`, `@suite/auth`). Cross-app workflows MUST be orchestrated using loosely coupled, asynchronous Domain Events (e.g., POS sale emitting `SALE_COMPLETED` for inventory deduction). Emitted events MUST safely evaporate with zero runtime errors if the listening app is not installed by that tenant.
*Rationale: Hexagonal ports prevent vendor lock-in and enable seamless adapter swapping without business logic changes. Asynchronous events allow optional apps to interoperate without hard runtime dependencies.*

### V. Double-Entry Financial Ledger & Fiscal Outbox (The Folio Law)
In all commercial, POS, PMS, and billing operations, storing transaction status as a naive `isPaid: boolean` flag is STRICTLY FORBIDDEN. All financial movements MUST be recorded in a double-entry ledger (Folio), where current balance is derived mathematically: $\text{Folio Balance} = \sum \text{Debits} - \sum \text{Credits}$. The platform MUST support multi-tender split settlements (e.g., partial Cash + partial UPI/Card) and record the collecting user identity (`collectedByUserId`) for cashier drawer audits. Statutory government fiscalization (e.g., Saudi ZATCA Phase 2, India GST IRP) MUST NEVER block synchronous checkout: internal invoices MUST be generated synchronously in $< 5\text{ms}$ with SHA-256 hash chaining, while external clearance is dispatched asynchronously via the transactional Outbox Pattern and BullMQ background workers.
*Rationale: Real-world business operations require robust accounting integrity, tamper-proof shift handovers, and protection against slow or offline government clearance servers.*

### VI. Multi-Tenant Defense-in-Depth & Non-Repudiation
Zero database queries are permitted to execute without explicit tenant boundary scoping (`organizationId` and optional `branchId`). Tenant isolation MUST be automatically enforced at the Prisma driver kernel via Prisma Client Extensions (`$extends`) intercepting every query at runtime. Sensitive business actions (payment voids, refunds, financial discounts, cash drawer events) MUST be recorded in a tamper-proof cryptographic audit ledger using sequential SHA-256 hash chaining ($\text{recordHash} = \text{SHA-256}(\text{prevHash} + \text{data})$). Verification endpoints MUST mathematically prove zero deletion or manipulation of audit records.
*Rationale: Multi-tenant leaks and internal operational theft are fatal enterprise risks. Enforcing kernel-level isolation and cryptographic auditability mathematically guarantees tenant privacy and non-repudiation.*

### VII. Operational Reality, Night Audit Clock & Offline Resilience
Business operational days MUST NOT turnover at calendar midnight (12:00 AM) while guests are sleeping and venues operate. Operational day turnover is branch-configurable and MUST default to **4:00 AM local branch time**. All night audits, room occupancy calculations, shift turnover reports, and daily financial summaries MUST execute against the operational clock (`@suite/core/clock`). For countertop and roving staff hardware (`apps/desktop`, `apps/mobile`), the system MUST provide local-first offline survivability using embedded SQLite queues, allowing staff to punch orders or check in guests during internet outages with automatic background reconciliation when connectivity resumes. Desktop POS MUST directly drive raw USB/COM ESC/POS 80mm thermal receipt printers and RJ11 cash drawers via native Tauri v2 Rust commands.
*Rationale: Enterprise software must survive harsh real-world conditions, including late-night operating hours and remote connectivity blackouts, without halting customer commerce.*

### VIII. Zero Static Data & Design System Primacy
Runtime production code is STRICTLY FORBIDDEN from introducing static mock data, hardcoded fallback entity arrays (such as fake site lists, mock tenants, demo templates, or dummy credentials), or in-memory mutable state stores (`new Map()`, module-scoped arrays). All domain entities, installed apps, and navigation trees MUST be fetched dynamically from `@suite/db` or official APIs; absent data MUST render genuine empty states or RFC 7807 problem details. All visual styling MUST strictly comply with `DESIGN.md` as the single source of truth, utilizing semantic CSS tokens (`text-text`, `text-secondary`, `bg-surface`, `bg-action`, `border-border`) mapped in `packages/ui/tailwind.preset.cjs`. Hardcoded arbitrary color names or hex values are strictly prohibited. Shared constants and configurations MUST NEVER be exported from `"use client"` modules if consumed by React Server Components.
*Rationale: Mock data masks architectural defects and compromises data integrity. Adhering to unified design tokens ensures pristine, consistent aesthetics while preventing bundle contamination and RSC runtime failures.*

### IX. Strict Issue-First SDLC & Mandatory Human Gates
You MUST NOT write code, edit files, create branches, or commit without an active, numbered GitHub Issue (`#X`) approved under an active milestone (NO TICKET = NO CODE). AI agents are STRICTLY FORBIDDEN from autonomously creating GitHub issues, milestones, committing code, pushing branches, creating Pull Requests, or executing Pull Request merges without explicit written human approval. Every issue MUST be proposed to the user in a structured tabular format and await explicit written approval before provisioning. All feature branches (`feat/#X-slug`) MUST branch from and target `dev` through the 3-tier promotion pipeline (`dev` $\rightarrow$ `staging` $\rightarrow$ `main`). When coding is complete, the agent MUST run local verification gates (`lint`, `typecheck`, `test`), present a pre-commit report, and WAIT for explicit written approval before committing or raising a PR. Once raised, every PR MUST pass CI and WAIT for explicit human written approval before merging via squash-and-merge. Autonomous database seeding (`prisma db seed`) or destructive schema resets (`migrate reset`) are strictly forbidden. The live homestay reference repository (`river-view-homstay-lite`) is strictly read-only and must never be altered.
*Rationale: Enterprise software demands disciplined governance, transparent traceability, and human-in-the-loop oversight to protect production environments from rogue or unverified mutations.*

### X. Dual-Plane Separation & Operator Control Plane (The Super Dashboard Law)
The system MUST maintain strict physical, network, and architectural separation between the **Tenant Management Plane** (`apps/dashboard`) and the **Platform Operator Control Plane** (`apps/super-dashboard`):
1. **Tenant Management Plane (`apps/dashboard` on `app.business-os.com`):** The client-facing workspace where tenant business owners, managers, and staff administer their own business operations. Every database query, state store, and UI component within this plane is strictly quarantined within that tenant's organization and branch boundaries.
2. **Platform Operator Control Plane (`apps/super-dashboard` on `control.business-os.com`):** The internal mission-control application reserved strictly for platform operators, founders, and SREs. It provides cross-tenant fleet governance, tenant impersonation with mandatory step-up audit logging, infrastructure monitoring, billing subscription management, and master catalog curation.
3. **Master Catalog & Template Governance:** Global turnkey templates (e.g. Website Builder site starter templates `cms_templates` with `organizationId = null`), system themes (`cms_themes`), and new component section blocks are authored, curated, and published exclusively from `apps/super-dashboard`. Tenants instantiate and customize copies of these templates, but the master catalog is governed exclusively by platform operators.
4. **Zero Bundle & Network Leakage:** Super-dashboard routes, API endpoints, administrative forms, and platform operator credentials MUST NEVER be included in `apps/dashboard` or client-facing bundles. The Super Dashboard MUST be deployed under isolated Zero-Trust access with hardware MFA (WebAuthn/FIDO2).
*Rationale: Exposing internal operational tools or master catalog controls to tenant workspaces creates critical privilege escalation vulnerabilities and bloats client bundles. Strict dual-plane separation ensures total operational control without compromising tenant isolation.*

### XI. Lean Interface Segregation, Dynamic Derivation & Complete Card Encapsulation
1. **SOLID Interface Segregation Principle (ISP):** Engineers and AI agents are STRICTLY FORBIDDEN from creating monolithic, multi-concern TypeScript interfaces that conflate orthogonal domain boundaries (e.g. bundling natural person identity, tenant tenancy, RBAC authorization, token expiry, and UI preferences into a flat interface). Every domain interface MUST adhere to Single Responsibility (SRP) and Interface Segregation (ISP), decomposing into granular sub-contexts (`UserIdentityContext`, `TenantSessionContext`, `SessionAuthorizationContext`, `SessionLifecycleContext`, `SessionPreferencesContext`) and composed via interface inheritance (`extends`). Component prop interfaces MUST cleanly segregate header metadata, layout slots, event callbacks, and interactive state.
2. **Centralized Environment Guards:** Runtime host inspection (`typeof window !== "undefined"`, `typeof document !== "undefined"`) MUST NEVER be scattered across UI components; it MUST be centralized in `lib/env.ts` (`isBrowser`, `isServer`) and imported cleanly.
3. **Complete Card Encapsulation & Zero-Scroll Presentation:** All visual elements of modal and authentication cards (emblems, titles, subtitles, badges, forms, actions, and secondary navigation) MUST be strictly encapsulated **inside** the card container. External floating wrappers outside the card and superfluous trust badges are forbidden. The card layout MUST maintain compact vertical rhythm so that on standard 100% desktop/laptop viewports, the entire card is visible with **zero vertical scrolling**. Natural scrolling engages only when the viewport height decreases below card threshold.
4. **Minimalist Input Law:** Forms MUST NOT solicit user inputs for fields that can be deterministically derived (e.g. initial sign up forms MUST NOT ask for "Full Name" if it can be derived from email address prefixes). Backends MUST dynamically derive fallback display names.
5. **Edge Middleware Public Route Whitelist:** When adding public authentication routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`), Edge middleware MUST explicitly whitelist them in `isAuthRoute` to prevent unauthenticated users from being trapped in redirect loops back to `/login`.
*Rationale: Bloated interfaces violate clean architecture and cause brittle dependencies. Un-encapsulated cards with unnecessary scrolling degrade operator UX. Centralized guards and minimal inputs ensure clean, professional, and defect-free interaction.*

### XII. Enterprise Clean Code & Refactoring Discipline
Every engineer and AI agent contributing to Business OS MUST write code that is simple, intention-revealing, modular, and maintainable. Code MUST adhere strictly to the following Clean Code standards:
1. **General Principles & Problem Solving:**
   - *Established Conventions:* Code MUST strictly adhere to TypeScript 5.7+ NodeNext conventions, Next.js App Router idioms, Hono OpenAPI route declarations, and established repository patterns.
   - *KISS (Keep It Simple, Stupid):* Prefer the simplest design that completely satisfies functional, security, and tenant isolation requirements. Premature abstractions and speculative flexibility ("YAGNI") are strictly forbidden.
   - *The Boy Scout Rule:* Leave touched files cleaner than you found them, strictly scoped to the active ticket. Fixing typos, improving variable names, and cleaning obsolete dead code within touched files is required; executing unrelated sweeping refactors outside the ticket's blast radius is strictly forbidden.
   - *Root-Cause Resolution:* Always diagnose and resolve the fundamental underlying cause of bugs. Superficial symptom workarounds (such as swallowing errors with empty catch blocks, applying arbitrary timeouts, or forcing types with `as any`) are strictly prohibited.
2. **Design, Boundaries & Architecture:**
   - *Configurable Data at High Levels:* Configuration constants, timeouts, rate limits, and environment variables MUST reside in dedicated configuration modules or package constants (e.g. `@suite/core/constants`, `@/lib/env.ts`) and be passed downward. Hardcoding magic timeouts or inline literals deep in business logic is prohibited.
   - *Behavior-Oriented Design & Polymorphism over Type Switching:* Avoid deep, nested `switch (type)` or cascading `if/else` ladders across business logic. Use strategy objects, lookup maps, or polymorphism via interfaces when dispatching behavior across extensible app modules or payment/media providers.
   - *Separation of Concurrency & Logic:* Asynchronous concurrency primitives (BullMQ workers, Redis distributed locks, CAS optimistic concurrency, and batch queues) MUST be segregated into dedicated worker adapters or queue producers. Pure business domain calculations (e.g. folio balances, tax rates, operational business dates) MUST remain synchronous and pure.
   - *Minimalist Abstraction:* Every interface, wrapper, and class MUST justify its existence by providing deep functionality or enforcing a distinct architectural boundary. Thin pass-through shims that do not transform data or add security are forbidden.
   - *Dependency Injection & Hexagonal Boundaries:* External dependencies (database clients, cache stores, email transports, third-party APIs) MUST be injected as interface ports into domain services. Domain logic in `@suite/core` MUST NEVER import database ORMs or external infrastructure directly.
   - *Law of Demeter (Principle of Least Knowledge):* Modules and components MUST interact only with immediate collaborators through explicit contracts. Avoid navigating deep object graphs (e.g. `user.organizations[0].organization.settings.billing.plan`).
3. **Understandability & Cognitive Ergonomics:**
   - *Consistent Solution Patterns:* Similar technical problems MUST be solved using identical architectural patterns across the monorepo (e.g. authentication gates, error handling, Redis caching, Zod input validation).
   - *Explanatory Variables:* Break complex boolean expressions, regex matches, or mathematical formulas into clearly named intermediate boolean or numeric variables.
   - *Centralized Boundary Handling:* Edge cases, empty arrays, nullish values, and out-of-bounds inputs MUST be validated and normalized at the system boundary (input validation layer) so internal domain logic operates on guaranteed invariants.
   - *Domain Value Objects over Primitive Obsession:* Essential domain values with business invariants (e.g. `BusinessDate`, `Slug`, `TaxIdentifier`, `Money`) MUST be encapsulated with dedicated Zod schemas and branded types rather than raw strings or untyped numbers.
   - *Zero Hidden Execution Order Coupling:* Methods and functions MUST NOT depend on hidden, implicit execution order or mutable module-level state. State transitions must be explicit and verifiable.
   - *Positive Conditionals:* Conditional expressions SHOULD be framed positively (e.g. `if (isAuthenticated)` instead of `if (!isUnauthenticated)`).
4. **Naming Standards:**
   - *Intention-Revealing Names:* Names of variables, functions, interfaces, and classes MUST clearly state why they exist, what they do, and how they should be used.
   - *Meaningful Distinctions:* Avoid vague or ambiguous names (e.g. `data`, `info`, `temp`, `manager`, `item`). Distinguish related concepts explicitly (e.g. `rawSessionPayload` vs. `verifiedSessionToken`).
   - *Searchable & Pronounceable:* Avoid idiosyncratic abbreviations (e.g. `usrOrgRel`, `calcBDate`). Use clear, standard English (`userOrganizationMembership`, `calculateBusinessDate`).
   - *Zero Magic Numbers & Literals:* All magic numbers and strings (HTTP status codes, session max-ages, cache TTLs, error codes) MUST be assigned to strongly typed, exported `as const` constants or domain enums.
   - *Zero Redundant Encoding:* Do NOT prefix interfaces with `I` (e.g. use `SessionContext`, not `ISessionContext`, unless implementing the platform app manifest contract `IPlatformApp`), and do NOT suffix variables with their type name (e.g. `userList` -> `users`).
5. **Functions & Methods:**
   - *Small & Focused:* Functions MUST be small and focused on a single task. Route handlers MUST NOT exceed 100 lines; complex orchestration MUST be delegated to domain services.
   - *Single Level of Abstraction (SLAP):* All statements within a function MUST operate at the same conceptual level of abstraction.
   - *Parameter Discipline:* Functions SHOULD accept $\le 2$ positional parameters. Functions requiring 3 or more inputs MUST accept a single, strongly-typed destructured options object.
   - *Zero Unintended Side Effects:* Functions MUST NOT mutate external state or arguments unexpectedly. Queries MUST NOT mutate state; commands MUST NOT silently perform secondary I/O.
   - *Flag Arguments Prohibited:* Functions MUST NOT take boolean flag arguments that radically split the function's internal execution into two distinct modes (e.g. `renderPage(isAdmin: boolean)`). Split these into two distinct, well-named functions.
6. **Comments & Documentation Hygiene:**
   - *Self-Explanatory Code over Redundant Comments:* Code MUST be written so cleanly that its purpose is evident from naming and structure. Comments that merely repeat what the code does (e.g. `// increment counter: i++`) are strictly forbidden.
   - *Dead Code Purge:* Commented-out blocks of code are strictly forbidden. Rely on Git version history.
   - *No Closing-Brace Comments:* Never write `// end of if` or `// end class`.
   - *Explain Intent & Constraints:* Comments MUST be reserved for explaining *why* an unusual technical choice was made, clarifying non-obvious business domain constraints (e.g. 4:00 AM night audit rollover), or warning about dangerous race conditions.
7. **Source Code Structure & Formatting:**
   - *Vertical Separation:* Distinct concepts, import blocks, type definitions, and function declarations MUST be separated by empty lines.
   - *Vertical Proximity:* Variables MUST be declared as close as possible to their first point of use.
   - *Top-Down Newspaper Flow:* Files MUST read top-down: public entrypoints, main interfaces, and primary functions at the top; low-level helper functions and private implementation details below.
   - *Whitespace & Formatting:* Formatting is governed automatically by Prettier and ESLint. Manual horizontal alignment used purely for visual decoration is prohibited.
8. **Objects, Data Structures & Classes:**
   - *Encapsulate Data Abstractions:* Internal implementation details of domain objects MUST remain encapsulated. Do not expose internal mutable state arrays or maps directly.
   - *Objects vs. Data Structures:* Maintain a clean distinction between Data Transfer Objects (plain types holding data without behavior) and Domain Entities/Services (rich abstractions exposing cohesive operations while keeping internal mutations private).
   - *Class & Module Cohesion:* Every class or module MUST have high cohesion, operating on a single cohesive set of state properties.
   - *Composition over Inheritance:* Prefer interface composition and functional facades over deep class inheritance hierarchies.
9. **Testing Excellence & Test Cleanliness:**
   - *One Logical Concept per Test:* Each test MUST verify exactly one logical behavior, business rule, or error scenario. Multiple assertions are permitted only when verifying different facets of that single logical outcome.
   - *Intention-Revealing Test Structure (AAA Pattern):* Tests MUST follow the Arrange-Act-Assert structure with descriptive test titles specifying condition and expected outcome (`it("rejects expired verification token with HTTP 400 INVALID_TOKEN", ...)`).
   - *Fast, Deterministic & Order-Independent:* Tests MUST NOT depend on execution order or shared mutable global state. Unit tests MUST execute in memory with zero network dependencies.
   - *Test Invariant Protection:* Weakening test assertions, deleting failing tests, or adding `@ts-ignore` to tests to force CI to pass is strictly prohibited.
10. **Code Smells & Architectural Degradation Signals:**
   - Engineers and AI agents MUST monitor and proactively remediate code smells during review: Rigidity, Fragility, Immobility, Needless Repetition, and Opacity.
*Rationale: Code maintainability and cognitive clarity directly govern velocity and bug prevention in enterprise systems. Clean, disciplined code with minimal abstractions, explicit boundaries, and focused functions ensures long-term system survivability.*

## Architectural Constraints & Technical Standards

### 1. Monorepo Orchestration & Workspace Topology
- **Monorepo Engine:** Turborepo v2 with pnpm v9 content-addressable store and strict virtual store symlinking. Phantom dependencies and undeclared imports are strictly blocked at compile time.
- **Dependency Flow:** Strictly unidirectional and inward-to-outward (`apps/*` $\rightarrow$ `packages/modules/*` $\rightarrow$ `packages/*` $\rightarrow$ `tooling/*`). Packages MUST NEVER depend on apps; apps MUST NEVER import other apps directly.
- **Boundary Enforcement:** `eslint-plugin-boundaries` mathematically blocks illegal cross-tier and cross-module imports. Subpath imports MUST use explicit `package.json` `"exports"` maps; deep relative directory traversal (`../../`) across package boundaries is forbidden.

### 2. Master Deployable Applications Topology
The web and runtime tier of Business OS comprises four specialized applications:
1. **`apps/api` (Platform API Gateway):** Hono v4 on Node.js 22 LTS with `@hono/zod-openapi` contracts, serving tenant REST and RPC endpoints as well as internal `/api/v1/super-dashboard/*` operator control routes protected by `PLATFORM_SUPER_ADMIN` RBAC policies.
2. **`apps/dashboard` (Tenant Workspace & Client App Launcher):** Next.js 16 App Router on `app.business-os.com`, serving the authenticated client workspace, dynamic app launcher, and embedded module studios (e.g. Website Builder Canvas Studio).
3. **`apps/web` (Public Storefront & Dynamic Delivery Engine):** Next.js 16 on `business-os.com`, `*.business-os.site`, and custom domains. Employs Edge Middleware for sub-5ms tenant hostname routing and dynamically renders published Abstract Syntax Trees (AST) with sub-50ms TTFB.
4. **`apps/super-dashboard` (Platform Operator Control Plane):** Next.js 16 App Router on `control.business-os.com`, isolated behind Cloudflare Zero-Trust and WebAuthn step-up authentication. Provides tenant fleet management, cross-tenant impersonation, global domain/SSL registry, and turnkey template curation.

### 3. Modular Super-Dashboard Contract (`IAppSuperDashboardModule`)
Any modular application in `packages/modules/*` that requires operator oversight MUST export an `IAppSuperDashboardModule` contract:
- Exposes administrative navigation nodes (e.g. "Global Templates", "Fleet Sites", "Domain Registry").
- Provides dedicated operator API sub-routers mounted under `/api/v1/super-dashboard/<module-slug>/*`.
- Guarantees that global entities (`organizationId = null`) can only be modified by authenticated operators through this contract.

### 4. Official UI Terminology Standard
To eliminate ambiguity across API routes, UI components, and documentation, the platform codifies three distinct top-level concepts:
1. **Workspace Launcher (`/launcher` or `/home`):** The primary home grid displaying all installed application icons for the authenticated organization and branch.
2. **Executive Dashboard App (`/dashboard`):** A dedicated application view aggregating cross-module KPI metrics, live occupancy, pulse trends, and charts via RBAC-gated providers (`IAppMetricProvider`).
3. **Reports & Document Center (`/reports`):** A dedicated application view for scheduling, generating, and downloading heavy batch PDF, CSV, and Excel historical reports without blocking interactive UI threads.

### 5. Thin-Shell Multi-Platform Architecture
- **Native Counter POS (`apps/desktop`):** Tauri v2 (Rust + Web) producing an ultra-compact binary ($< 15\text{MB}$, $< 35\text{MB}$ RAM) with embedded SQLite for zero-latency local-first operation and direct OS COM/USB thermal printer and cash drawer control.
- **Roving Staff Shell (`apps/mobile`):** Capacitor v8 native shell with offline SQLite synchronization and hardware camera access for instant guest KYC scanning.
- **Decoupled Compliance Daemon (`apps/worker-audit`):** Standalone Node.js 22 + BullMQ v5 worker processing sequential SHA-256 hash chains, monthly table partitions, and cold storage archival to Cloudflare R2 Parquet files.

### 6. Concurrency Control & Two-Tier Locking
- **Tier 1 (In-Memory Concurrency Shield):** Short-lived resource contention (e.g. 10-minute room reservation locks during checkout) MUST be acquired atomically in Redis using `SET lock:<resource> <holderId> NX EX 600`, returning rejection within $< 0.3\text{ms}$ to shield PostgreSQL from lock contention.
- **Tier 2 (Database Optimistic Concurrency):** Content updates (e.g. CMS visual page definitions, inventory counts) MUST utilize Compare-And-Swap (CAS) with version numbers or timestamps to detect concurrent modification conflicts and prevent silent overwrites.

### 7. API & Communication Protocols
- **API Contracts:** Every HTTP route MUST be registered with `@hono/zod-openapi` using `createRoute()`, validating parameters, request bodies, and RFC 7807 problem details error envelopes (`type`, `title`, `status`, `detail`, `instance`, `code`, `invalidParams`).
- **Client RPC Typing:** Client applications interact with backend services via `@hono/zod-openapi` RPC client (`hc<AppType>()`) ensuring 100% end-to-end compile-time type safety with zero code generation drift.
- **Latency Budget & Idempotency:** Synchronous HTTP handlers MUST respond within $< 15\text{ms}$. Heavy workloads (PDF generation, notifications, cryptographic audit chaining) MUST be offloaded to BullMQ in $< 1\text{ms}$. All state-mutating requests (`POST`/`PATCH`) MUST support `x-idempotency-key` with 24-hour Redis response caching.

## Development Workflow, Verification & Quality Gates

### 1. The 12-Pillar SDLC & Branching Pipeline
- **Branch Hierarchy:**
  - `dev`: Active integration branch. All feature branches (`feat/#X-slug`), bug fixes (`fix/#X-slug`), and chores (`chore/#X-slug`) MUST branch from and merge into `dev`.
  - `staging`: Pre-release testing environment for integration suites, 4:00 AM night audit simulations, and beta previews.
  - `main`: Live production environment powering paying customers. Merges into `main` occur strictly via verified release PRs from `staging` with SemVer release tags.
- **Commit Standard:** Conventional Commits formatted as `type(scope): description (closes #X)` (e.g., `feat(pos): implement offline ticket queueing (closes #42)`).

### 2. Mandatory Verification Gates
Before submitting any Pull Request, contributors and agents MUST execute and pass all local quality gates:
1. `pnpm turbo run lint`: Zero ESLint warnings or boundary violations.
2. `pnpm turbo run typecheck`: Zero TypeScript compiler errors with `strict: true` and zero `any` or `@ts-ignore` overrides.
3. `pnpm turbo run test`: Full execution of Vitest unit and integration test suites verifying tenant isolation and business logic.
4. **Pre-Execution Blast Radius Gate:** Before starting any issue, the contributor MUST verify that shared core packages (`@suite/core`, `@suite/auth`, `schema/core.prisma`) remain untouched for modular app tickets and confirm zero reverse dependencies.
5. **Post-Merge Integration Gate (P0 Stop-the-Line):** Immediately upon merging any PR to `dev`, the post-merge CI pipeline MUST turn Green. If `dev` turns Red, all new feature work halts immediately until `dev` is healthy.

### 3. Interview-Grade Technical Documentation
For every substantive feature or architectural ticket, contributors MUST maintain dedicated issue documentation inside the application's documentation directory (`05-modular-apps/<app-name>/issues/issue-<id>-<slug>.md`). Documentation MUST detail:
- Design patterns applied (Facade, Strategy, Outbox, CAS Concurrency, Factory).
- System design principles and boundary compliance.
- Implementation trade-offs, rejected alternatives, and edge case handling.
- Staff/Principal Engineer interview defense questions and proofs.

## Governance

This Constitution is the supreme engineering authority for the Business OS project. It supersedes all informal discussions, legacy notes, personal preferences, or unratified guides. No individual contributor, team, or AI agent possesses the authority to bypass or dilute these principles.

### Amendment Procedure
1. Any proposed modification or addition to this Constitution MUST be documented in an Architectural Decision Record (ADR) detailing the motivating problem, architectural impact, migration strategy, and backward compatibility assessment.
2. The amendment proposal MUST undergo peer review and receive explicit written approval from the repository owner before being codified.
3. Upon approval, `.specify/memory/constitution.md` MUST be updated, incrementing the version in accordance with the Semantic Versioning policy below.

### Semantic Versioning Policy
The Constitution version follows strict Semantic Versioning (`MAJOR.MINOR.PATCH`):
- **MAJOR:** Backward-incompatible governance changes, core principle removals, or fundamental shifts in architectural constraints.
- **MINOR:** Addition of new non-negotiable principles, new architectural tiers, or substantial expansion of governance standards.
- **PATCH:** Clarifications, terminology refinements, formatting updates, or non-semantic wording corrections.

### Compliance Review Expectations
Every code contribution, pull request review, and architectural plan MUST explicitly verify compliance with this Constitution. Architectural violations (such as leaky multi-tenancy, cross-module tight coupling, core schema mutation, hardcoded mock data, off-token styling, or unapproved PR merges) are non-negotiable blockers that mandate immediate PR rejection.

**Version**: 1.4.0 | **Ratified**: 2026-10-15 | **Last Amended**: 2026-10-16
