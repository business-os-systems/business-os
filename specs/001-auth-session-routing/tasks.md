# Implementation Tasks: Identity, Authentication & Session Routing

**Feature**: `001-auth-session-routing`  
**Document ID**: `SPEC-AUTH-001`  
**Specification Reference**: [spec.md](./spec.md)  
**Implementation Plan**: [plan.md](./plan.md)  
**Data Model**: [data-model.md](./data-model.md)  
**OpenAPI Contract**: [contracts/auth-openapi.json](./contracts/auth-openapi.json)  
**Validation Runbook**: [quickstart.md](./quickstart.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, testing infrastructure, shared constants, and extensible registries.

- [x] T001 Initialize feature test infrastructure in `apps/dashboard/tests/auth-gate.test.tsx` and `packages/auth/tests/auth.test.ts`
- [x] T002 Configure Cloudflare Turnstile test mode helper and dummy keys (`siteKey: "1x00000000000000000000AA"`, `secretKey: "2x00000000000000000000AB"`) when `NODE_ENV !== "production"` in `apps/dashboard/src/lib/turnstile.ts`
- [x] T003 [P] Configure session duration constants (`SESSION_EPHEMERAL_MAX_AGE_SECONDS=86400`, `SESSION_PERSISTENT_MAX_AGE_SECONDS=2592000`) and cookie encoding helpers in `apps/dashboard/src/lib/auth-constants.ts`
- [x] T004 [P] Implement extensible `OAuthProviderRegistry` interface in `apps/dashboard/src/lib/oauth-registry.ts` with typed descriptors for launch providers (Google, Microsoft, GitHub) and icon definitions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure and base route handlers that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Implement zero-flash theme script in `apps/dashboard/src/app/layout.tsx` resolving OS `matchMedia('(prefers-color-scheme: dark)')` and database preference before paint
- [x] T006 [P] Implement extensible post-login route resolution dispatcher (`resolvePostLoginRoute(userRole, userPermissions)`) supporting single-app direct handoff in `apps/dashboard/src/lib/route-dispatcher.ts`
- [x] T007 [P] Implement cryptographic session token signing, verification, and tenant/branch payload encoder in `packages/auth/src/session/session-token.ts`
- [x] T008 Implement user preferences endpoint `PATCH /api/v1/user/preferences` in `apps/dashboard/src/app/api/v1/user/preferences/route.ts` validating theme enum (`"system" | "light" | "dark"`) and custom session timeout (`session_timeout_seconds`)
- [x] T009 Implement session termination endpoint `POST /api/auth/logout` in `apps/dashboard/src/app/api/auth/logout/route.ts` revoking server session in `sessions` table and purging cookies

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Core Authentication Gateway & Theme Synchronization (Priority: P1) 🎯 MVP

**Goal**: Deliver a responsive, accessible single-card authentication gateway supporting email/password, social OAuth, passkeys, and zero-flash theme synchronization adhering to `DESIGN.md`.

**Independent Test**: Scenario 1 & Scenario 2 in [quickstart.md](./quickstart.md). Navigating to `/login` or `/signup` renders a 400px card in correct light/dark theme; user registration creates database records and issues session cookie.

### Tests for User Story 1
- [x] T010 [P] [US1] Unit and contract tests for authentication gateway in `packages/auth/tests/auth.test.ts`

### Implementation for User Story 1
- [x] T011 [P] [US1] Build centered 400px envelope card layout container (`modal-sm`, fixed width `400px`, level-1 border, level-2 elevation) in `apps/dashboard/src/components/auth/auth-card.tsx`
- [x] T012 [P] [US1] Build interactive email & password form with real-time password complexity validation (min 8 chars, 1 uppercase, 1 number, 1 special symbol) and show/hide toggle in `apps/dashboard/src/components/auth/email-password-form.tsx`
- [x] T013 [P] [US1] Build OAuth provider button row (Google, Microsoft, GitHub) in `apps/dashboard/src/components/auth/oauth-providers.tsx` using `OAuthProviderRegistry`
- [x] T014 [P] [US1] Build FIDO2/WebAuthn passkey button triggering `navigator.credentials.get()` in `apps/dashboard/src/components/auth/passkey-button.tsx`
- [x] T015 [US1] Implement user registration endpoint `POST /api/auth/register` in `apps/dashboard/src/app/api/auth/register/route.ts` creating `User` (`email @unique @db.VarChar(255)`, `name @db.VarChar(191)`, `emailVerified: false`, `metadata.onboarding_status: "IN_PROGRESS"`, `metadata.current_onboarding_step: 1`), hashing password in `Account`
- [x] T016 [US1] Implement user login endpoint `POST /api/auth/login` in `apps/dashboard/src/app/api/auth/login/route.ts` validating credentials, verifying Turnstile token, issuing 24h rolling or 30d persistent session cookie
- [x] T017 [US1] Assemble responsive `/login` page in `apps/dashboard/src/app/(auth)/login/page.tsx` integrating AuthCard, EmailPasswordForm, OAuthProviders, and PasskeyButton
- [x] T018 [US1] Build `/signup` page with Terms & Privacy microcopy in `apps/dashboard/src/app/(auth)/signup/page.tsx`

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Route Guard State Machine & Edge Middleware (Priority: P1)

**Goal**: Enforce strict server-side edge route guards preventing authenticated users from viewing auth cards, redirecting incomplete onboarding users, and dispatching roles.

**Independent Test**: Scenario 2 & Scenario 6 in [quickstart.md](./quickstart.md). Navigating to `/login` as authenticated user redirects to `/dashboard` or `/onboarding/step-N`; signing out blocks back-navigation.

### Tests for User Story 2
- [x] T019 [P] [US2] Integration tests for route guard rules (Guest Guard, Onboarding Guard, API route protections) in `apps/dashboard/tests/auth-gate.test.tsx`

### Implementation for User Story 2
- [x] T020 [US2] Implement Next.js Edge Middleware route guard in `apps/dashboard/src/middleware.ts` enforcing Rule 1 (Guest exclusion from `/login`, `/signup`), Rule 4 (Onboarding guard bouncing incomplete users to `/onboarding/step-N`), and header propagation
- [x] T021 [US2] Integrate `resolvePostLoginRoute` dispatcher into post-login client handshake in `apps/dashboard/src/app/(auth)/login/page.tsx`
- [x] T022 [US2] Build offline detection boundary with "Retry connection" CTA in `apps/dashboard/src/components/layout/offline-view.tsx`

**Checkpoint**: User Story 2 is fully functional; route transitions and protections operate server-side.

---

## Phase 5: User Story 3 - 3-Step Platform Onboarding Pipeline & Tenant Bootstrapping (Priority: P1)

**Goal**: Deliver the streamlined 3-step platform onboarding pipeline with atomic Tenant-Owner bootstrapping (`branchId: null`), industry-tailored app selection, live animated provisioning engine, confetti celebration launchpad, and invitation fast-track bypass.

**Independent Test**: Scenario 2 & Scenario 8 in [quickstart.md](./quickstart.md). Completing Steps 1–3 creates Organization, auto-provisions root Branch, Owner role, licenses installed apps, and sets `onboarding_status: "COMPLETED"`; invited member bypasses Steps 1 & 2.

### Tests for User Story 3
- [ ] T023 [P] [US3] Unit and contract tests for onboarding endpoints, slug availability, and workspace provisioning in `apps/dashboard/tests/onboarding.test.ts`

### Implementation for User Story 3
- [ ] T024 [P] [US3] Build centered onboarding container layout and stepper header (`01 Organization Details` → `02 Application Selection` → `03 Workspace Setup`) in `apps/dashboard/src/app/(onboarding)/layout.tsx`
- [ ] T025 [P] [US3] Build Step 1 Organization Details UI in `apps/dashboard/src/app/(onboarding)/step-1/page.tsx` (`organizationName`, `organizationSlug` with `https://` prefix and `.businessos.app` suffix + live availability badge, interactive multi-select `industries` tag pills and search)
- [ ] T026 [US3] Implement Step 1 API `POST /api/v1/onboarding/step-1` and slug availability endpoint `GET /api/v1/onboarding/check-slug` in `apps/dashboard/src/app/api/v1/onboarding/step-1/route.ts` and `apps/dashboard/src/app/api/v1/onboarding/check-slug/route.ts` executing atomic transaction: create `Organization`, auto-create root `Branch` ("Main Location", "MAIN"), `UserOrganization` (`role: "Owner"`), system `Role` (`slug: "owner"`, `isSystem: true`), `role_permissions`, and `UserBranchRole` with `branchId: null`
- [ ] T027 [P] [US3] Build Step 2 Application Selection UI in `apps/dashboard/src/app/(onboarding)/step-2/page.tsx` rendering industry recommendation header, top section "Recommended for your industry" (pre-selected), and bottom section "Additional workspace applications"
- [ ] T028 [US3] Implement Step 2 API `POST /api/v1/onboarding/step-2` in `apps/dashboard/src/app/api/v1/onboarding/step-2/route.ts` validating app selections, persisting to `User.metadata.selected_apps`, and advancing `current_onboarding_step: 3`
- [ ] T029 [P] [US3] Build Step 3 Provisioning & Launchpad UI in `apps/dashboard/src/app/(onboarding)/step-3/page.tsx` featuring animated master progress bar (0% → 100%), module deployment status items, paper glitters/confetti celebration burst, active app summary, and 5-second countdown timer auto-redirect button
- [ ] T030 [US3] Implement Workspace Completion API `POST /api/v1/onboarding/complete` in `apps/dashboard/src/app/api/v1/onboarding/complete/route.ts` provisioning `InstalledApp` records in `@suite/db`, marking `onboarding_status = "COMPLETED"`, clearing `current_onboarding_step`, and updating session claims
- [ ] T031 [US3] Implement Organization Invitation acceptance endpoint `POST /api/v1/auth/invitation/accept` and route `/invite/[token]` in `apps/dashboard/src/app/(auth)/invite/[token]/page.tsx` bypassing Steps 1 & 2 directly to `COMPLETED`

**Checkpoint**: User Stories 1, 2, and 3 provide a complete end-to-end onboarding and tenant activation flow.

---

## Phase 6: User Story 4 - Enterprise SSO & Home Realm Discovery (Priority: P2)

**Goal**: Support Enterprise Single Sign-On with real-time Home Realm Discovery (HRD) and JIT user provisioning.

**Independent Test**: Scenario 3 in [quickstart.md](./quickstart.md). Typing enterprise email dynamically swaps password field to "Sign in with Enterprise SSO".

### Tests for User Story 4
- [x] T032 [P] [US4] Unit tests for SSO domain discovery and JIT user provisioning in `packages/auth/tests/sso-discovery.test.ts`

### Implementation for User Story 4
- [x] T033 [US4] Implement domain discovery endpoint `POST /api/auth/sso/discover` in `apps/dashboard/src/app/api/auth/sso/discover/route.ts` matching corporate domains to SAML/OIDC IdP
- [x] T034 [US4] Build dynamic SSO redirect component in `apps/dashboard/src/components/auth/sso-redirect-card.tsx` switching password input to "Sign in with Enterprise SSO"
- [x] T035 [US4] Implement JIT user provisioning handler in `packages/auth/src/sso/jit-provisioning.ts` mapping enterprise claims to user profile and roles

**Checkpoint**: User Story 4 allows corporate SSO authentication without credential entry.

---

## Phase 7: User Story 5 - Multi-Tenancy Resolution & Tenant Chooser (Priority: P2)

**Goal**: Disambiguate workspace access for multi-tenant users and auto-select single-tenant users directly.

**Independent Test**: Scenario 5 in [quickstart.md](./quickstart.md). Multi-tenant users land on `/auth/choose-tenant`; selecting organization updates session cookie context.

### Tests for User Story 5
- [x] T036 [P] [US5] Unit tests for tenant disambiguation and context switching in `packages/auth/tests/branch-context.test.ts`

### Implementation for User Story 5
- [x] T037 [US5] Implement tenant list endpoint `GET /api/v1/auth/tenants` in `apps/dashboard/src/app/api/v1/auth/tenants/route.ts` returning user's organizations and branch roles
- [x] T038 [US5] Implement tenant switch endpoint `POST /api/v1/auth/switch-tenant` in `apps/dashboard/src/app/api/v1/auth/switch-tenant/route.ts` setting active organization and branch in session cookie
- [x] T039 [US5] Build workspace disambiguation screen in `apps/dashboard/src/app/(auth)/choose-tenant/page.tsx` displaying organization cards with slugs, roles, and avatar

**Checkpoint**: User Story 5 provides seamless multi-organization navigation.

---

## Phase 8: User Story 6 - Deferred Email Verification & Marketplace Installation Gate (Priority: P2)

**Goal**: Implement deferred email verification with rate-limited resend, persistent dashboard warning banner, and Level 3 dialog blocking app installation.

**Independent Test**: Scenario 4 in [quickstart.md](./quickstart.md). Unverified user sees dashboard banner, 60s cooldown timer; clicking Install on app pops verification required dialog and returns HTTP 403.

### Tests for User Story 6
- [ ] T040 [P] [US6] Unit and integration tests for email verification token lifecycle and rate limiter in `packages/auth/tests/verification.test.ts`

### Implementation for User Story 6
- [ ] T041 [US6] Implement verification token dispatch endpoint `POST /api/auth/verify-email/request` in `apps/dashboard/src/app/api/auth/verify-email/request/route.ts` with 60s client cooldown and server-side rate limit of max 5 requests per hour (HTTP 429)
- [ ] T042 [US6] Implement token confirmation endpoint `GET /api/auth/verify-email/confirm` in `apps/dashboard/src/app/api/auth/verify-email/confirm/route.ts` verifying SHA-256 token and updating `User.emailVerified = true`
- [ ] T043 [US6] Build expired verification handler page in `apps/dashboard/src/app/(auth)/verify-expired/page.tsx` with resend CTA
- [ ] T044 [US6] Build top persistent unverified email warning banner in `apps/dashboard/src/components/layout/unverified-email-banner.tsx` with live 60s cooldown timer
- [ ] T045 [US6] Implement marketplace install gate dialog (`modal-sm`, `400px`) and guard API endpoint `POST /api/v1/apps/[id]/install` in `apps/dashboard/src/app/api/v1/apps/[id]/install/route.ts` returning HTTP 403 `EMAIL_VERIFICATION_REQUIRED`

**Checkpoint**: User Story 6 protects marketplace operations while allowing uninterrupted onboarding.

---

## Phase 9: User Story 7 - Account Security, Password Reset & Collision Defense (Priority: P2)

**Goal**: Support password reset with global session revocation and OAuth account collision challenge resolution.

**Independent Test**: Scenario 7 in [quickstart.md](./quickstart.md). Password reset completes at `/auth/reset-password` and invalidates all active sessions in the `sessions` table across other devices.

### Tests for User Story 7
- [ ] T046 [P] [US7] Integration tests for password reset session revocation and OAuth collision flow in `apps/dashboard/tests/account-security.test.tsx`

### Implementation for User Story 7
- [ ] T047 [US7] Build password recovery page in `apps/dashboard/src/app/(auth)/forgot-password/page.tsx` dispatching 15m single-use token
- [ ] T048 [US7] Build password reset completion page in `apps/dashboard/src/app/(auth)/reset-password/page.tsx` enforcing 8+ char complexity and show/hide toggle
- [ ] T049 [US7] Implement password reset endpoint `POST /api/auth/reset-password` in `apps/dashboard/src/app/api/auth/reset-password/route.ts` updating password hash and deleting all active records in `sessions` table for `userId`
- [ ] T050 [US7] Build account linking challenge page in `apps/dashboard/src/app/(auth)/link-account/page.tsx` prompting existing password on OAuth collision
- [ ] T051 [US7] Implement account linking endpoint `POST /api/auth/link-account` in `apps/dashboard/src/app/api/auth/link-account/route.ts` linking provider in `Account` upon password verification

**Checkpoint**: User Story 7 delivers hardened account security, session revocation, and collision prevention.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting quality checks, accessibility validation, and documentation.

- [ ] T057 [P] Accessibility and keyboard navigation audit across all auth forms (`aria-invalid`, `focus-ring`, 44x44px touch targets)
- [ ] T058 [P] Documentation updates in `docs/auth-session-routing.md` detailing architecture, security model, and API contracts
- [ ] T059 Run quickstart validation runbook (`quickstart.md` Scenarios 1–8) and verify all Vitest suites pass

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Phase 2 completion.
  - Phase 3 (US1 - Core Gateway): Can start after Phase 2.
  - Phase 4 (US2 - Route Guard): Depends on US1 (requires login page and token helpers).
  - Phase 5 (US3 - Onboarding Pipeline): Depends on US1 and US2 (requires registration and route guard).
  - Phase 6 (US4 - Enterprise SSO): Can run in parallel with US3 after US1.
  - Phase 7 (US5 - Multi-Tenancy): Depends on US3 (requires organization records).
  - Phase 8 (US6 - Email Verification): Can run after US1 and US3.
  - Phase 9 (US7 - Account Security): Can run after US1.
- **Polish (Phase 10)**: Depends on all user stories being complete.

---

## Parallel Execution Opportunities

```bash
# Launch Foundational parallel tasks:
Task: "T006 [P] Implement route-dispatcher in apps/dashboard/src/lib/route-dispatcher.ts"
Task: "T007 [P] Implement session-token in packages/auth/src/session/session-token.ts"

# Launch User Story 1 UI components in parallel:
Task: "T011 [P] [US1] Build AuthCard in apps/dashboard/src/components/auth/auth-card.tsx"
Task: "T012 [P] [US1] Build EmailPasswordForm in apps/dashboard/src/components/auth/email-password-form.tsx"
Task: "T013 [P] [US1] Build OAuthProviders in apps/dashboard/src/components/auth/oauth-providers.tsx"
Task: "T014 [P] [US1] Build PasskeyButton in apps/dashboard/src/components/auth/passkey-button.tsx"

# Launch Onboarding step pages in parallel:
Task: "T025 [P] [US3] Build Step 1 UI in apps/dashboard/src/app/(onboarding)/step-1/page.tsx"
Task: "T027 [P] [US3] Build Step 2 UI in apps/dashboard/src/app/(onboarding)/step-2/page.tsx"
Task: "T029 [P] [US3] Build Step 3 UI in apps/dashboard/src/app/(onboarding)/step-3/page.tsx"
```

---

## Implementation Strategy

### MVP First (Phases 1, 2, 3)
1. Complete Phase 1: Setup infrastructure, Turnstile test keys, auth constants.
2. Complete Phase 2: Foundational theme script, session tokens, user preferences.
3. Complete Phase 3: Core authentication card, login, signup, theme sync.
4. **STOP and VALIDATE**: Verify Scenarios 1 & 2 in `quickstart.md`.

### Incremental Delivery
1. Add Phase 4 (US2): Edge middleware route guards and back-navigation guards.
2. Add Phase 5 (US3): 3-step onboarding pipeline and Tenant-Owner bootstrapping.
3. Add Phases 6–9 (US4–US7): Enterprise SSO, multi-tenancy, deferred email verification, password reset.
4. Execute Phase 10: Polish, accessibility audit, and full quickstart validation.


---

## Phase 12: Convergence

**Purpose**: Remediate code gaps, remove static fallbacks, and optimize route resolution per convergence review.

- [x] T060 [P] Enforce BETTER_AUTH_SECRET as single source of truth across both dev and prod without hardcoded secret fallbacks in `packages/auth/src/session/session-token.ts` and `apps/dashboard/src/lib/auth-constants.ts` per Constitution Zero Static Data (contradicts)
- [x] T061 [P] Create centralized environment helper module exporting `isProduction`, `isDevelopment`, `isTest` in `apps/dashboard/src/lib/env.ts` and `packages/auth/src/env.ts` per Code Standards (contradicts)
- [x] T062 [P] Replace hardcoded error type domain with standard RFC 7807 relative URI (`/errors/<code-in-kebab>`) in `apps/dashboard/src/app/api/v1/user/preferences/route.ts` per API Standards (contradicts)
- [x] T063 [P] Remove arbitrary ad-hoc token strings (`dummy-test-token`) from Cloudflare Turnstile verification in `apps/dashboard/src/lib/turnstile.ts` per Constitution Zero Static Data (contradicts)
- [x] T064 Refactor `APP_ROOT_ROUTES` in `apps/dashboard/src/lib/route-dispatcher.ts` to remove duplicate multi-key mappings and bind to canonical app IDs per plan.md (partial)
- [x] T065 Refactor `resolvePostLoginRoute` in `apps/dashboard/src/lib/route-dispatcher.ts` to be cleanly extensible and optimized without redundant branching per spec.md §5.1 (partial)
- [x] T066 Run turbo test suite and update test assertions to verify clean environment helpers, single secret variable, and dynamic RFC 7807 problem details in `apps/dashboard/tests/auth-gate.test.tsx` and `packages/auth/tests/auth.test.ts`


---

## Phase 13: Convergence

**Purpose**: Remediate remaining static mock credentials and enforce centralized environment helpers across all routes.

- [x] T067 [P] Remove hardcoded dummy OAuth client IDs (dev-*-client-id) in `apps/dashboard/src/lib/oauth-registry.ts` per Constitution Zero Static Data (contradicts)
- [x] T068 [P] Replace raw process.env.NODE_ENV check with isProduction from @/lib/env in `apps/dashboard/src/app/api/auth/login/route.ts` per Code Standards (contradicts)
- [x] T069 [P] Remove hardcoded "localhost" hostname from Turnstile verification in `apps/dashboard/src/lib/turnstile.ts` per Constitution Zero Static Data (contradicts)

---

## Phase 14: Convergence

**Purpose**: Encapsulate all auth branding and navigation inside the auth envelope card and remove external trust badges for zero-scroll presentation at 100% zoom.

- [x] T070 [P] Encapsulate branding, logo, titles, form controls, and footer navigation strictly inside the envelope card container in `apps/dashboard/src/components/auth/auth-card.tsx` per UI Convergence
- [x] T071 [P] Remove external TLS encrypted, Zero-Trust Gate, and Kernel Tenant Isolated badges from `apps/dashboard/src/app/(auth)/login/page.tsx` and `apps/dashboard/src/app/(auth)/signup/page.tsx` per UI Convergence
- [x] T072 [P] Calibrate compact vertical rhythm ensuring zero vertical scrollbars on standard 100% desktop viewports while preserving responsive scroll on smaller viewports in `apps/dashboard/src/components/auth/auth-card.tsx` per UI Convergence
- [x] T073 Update test suites in `apps/dashboard/tests/auth-gate.test.tsx` and `apps/dashboard/tests/e2e-studio-integration.test.tsx` reflecting clean signup navigation assertions per UI Convergence

---

## Phase 15: Convergence

**Purpose**: Remediate step-1 back-navigation form data loss, fix button directional arrow optical scaling, and enhance test coverage for onboarding re-entry.

- [x] T074 [US3] Persist and pre-populate Step 1 organization form data (`orgName`, `slug`, `selectedIndustries`) on mount from existing tenant session profile, and support idempotent re-submission without self-domain collision in `apps/dashboard/src/app/onboarding/step-1/page.tsx` and `apps/dashboard/src/app/api/v1/onboarding/step-1/route.ts` per US3/AC1 (partial)
- [x] T075 [P] Replace literal unicode arrows with calibrated, inline SVG icons (`w-4 h-4`) matching button typography and optical alignment on back and next buttons in `apps/dashboard/src/app/onboarding/step-1/page.tsx`, `step-2/page.tsx`, and `step-3/page.tsx` per DESIGN.md Primacy (partial)
- [x] T076 [P] Add unit and integration test coverage for Step 1 pre-population, idempotent updates, and button navigation in `apps/dashboard/tests/onboarding.test.tsx` per Testing Standards (partial)


