# Implementation Plan: Identity, Authentication & Session Routing

**Branch**: `001-auth-session-routing` | **Date**: 2026-10-15 | **Spec**: [specs/001-auth-session-routing/spec.md](./spec.md)  
**Document ID**: `SPEC-AUTH-001`  
**Governing Documents**: `DESIGN.md` (Enterprise Business OS v2.0.0), `AGENTS.md`

---

## Summary

Implement the enterprise identity, authentication, session lifecycle, and route gating infrastructure specified in `SPEC-AUTH-001` as clarified and finalized:
1. **Single-Card Auth Gateway & Extensible Providers**: Responsive `400px` (`modal-sm`) card supporting Email/Password, Federated OAuth (Google, Microsoft, GitHub) powered by an extensible `OAuthProviderRegistry` (Open-Closed Principle), Enterprise SSO with Home Realm Discovery (HRD), and FIDO2/WebAuthn passkeys adhering to `DESIGN.md` visual tokens.
2. **Zero-Flash Theme Engine**: Cross-platform theme synchronization (`system`, `light`, `dark`) with zero-flash rendering in `<head>`, database persistence in `User.metadata`, and real-time client propagation.
3. **Strict Route Guards & Edge Middleware**: Server-side Next.js Edge route guards enforcing Guest Guards (preventing authenticated re-entry to `/login`), 3-step sequential onboarding (`/onboarding/step-1` to `step-3`), Multi-Tenant Disambiguation (`/auth/choose-tenant`), single-tenant auto-selection, and Dashboard Protection.
4. **RBAC Dynamic Dashboard & Extensible App Dispatcher**: Dashboard adapts views to user roles (Admin, Manager, Employee, Intern). Includes `resolvePostLoginRoute` to fast-track single-app-permission users (e.g., POS-only or CRM-only) directly into their application root while multi-app users land on the dashboard.
5. **Deferred Email Verification & Anti-Spam Protections**: Allows onboarding progression with a persistent dashboard warning banner, 60-second resend cooldown timer, 5/hour rate limit (HTTP 429), and strict Level 3 modal (`modal-sm`) and API boundary (`403 Forbidden`) gates guarding marketplace app installation.
6. **Account Collision & Global Session Governance**: Account collision challenge on `/auth/link-account?ticket=...` requiring existing password verification. Password reset completion on `/auth/reset-password?token=...` with global revocation of all active session tokens in `sessions` table across all devices. Non-production Turnstile test mode with official dummy keys for offline CI test execution.

---

## Technical Context

**Language/Version**: TypeScript 5.7+ (Strict Mode, zero `any`, zero `@ts-ignore`)  
**Primary Dependencies**: Better-Auth 1.1+, Next.js 14/15 App Router, `@hono/zod-openapi`, `@suite/db` (Prisma ORM), `@suite/ui` (Tailwind preset & semantic tokens), `@node-rs/argon2`  
**Storage**: PostgreSQL (Prisma ORM in `@suite/db`), Redis (Session cache in `@suite/redis`)  
**Testing**: Vitest (`apps/dashboard/tests/`, `packages/auth/tests/`), React Testing Library  
**Target Platform**: Web (`web-desktop`, `web-tablet`, `web-mobile`), Native Desktop (Tauri/Electron), Native Mobile (iOS/Android)  
**Project Type**: Monorepo Web Application & Shared Platform Packages (`apps/dashboard`, `apps/api`, `packages/auth`, `packages/ui`)  
**Performance Goals**: <50ms session verification in Edge middleware; <10ms zero-flash theme resolution in document `<head>`  
**Constraints**:
- Absolute adherence to `DESIGN.md` semantic color tokens (zero arbitrary hex or hardcoded Tailwind colors).
- Core Domain Immutability Law: Zero changes to `schema/core.prisma`; zero reverse relations on core models.
- Zero Static Data Law: All user preferences, tenant memberships, and onboarding states are fetched from PostgreSQL or official APIs.
- RSC Boundary Law: Pure TypeScript data structures and constants without `"use client"` directives for Server Component consumption.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Directive / Gate | Status | Verification Detail |
| :--- | :---: | :--- |
| **Rule 0: Pre-Change Rule Verification** | **PASS** | Monorepo directives and negative constraints evaluated and applied prior to plan formulation. |
| **Rule 1: Issue-First & Human Approval Gate** | **PASS** | Planning artifacts generated in `specs/001-auth-session-routing/`. Code modifications require user approval of ticket breakdown prior to branch creation. |
| **Branch Hierarchy Standard** | **PASS** | Target branch will branch from and target `dev`. |
| **Core Domain Immutability Law** | **PASS** | `core.prisma` is read-only. Authentication utilizes existing `User.metadata`, `Account`, `Session`, `Verification`, and `Passkey` entities. |
| **DESIGN.md Primacy Law** | **PASS** | `400px` fixed envelope (`modal-sm`), `40px` controls (`control-lg`), `44x44px` touch targets, tokens `--bos-bg`, `--bos-surface`, `--bos-border`, `--bos-action`, etc. strictly specified. |
| **Zero Static Data Law** | **PASS** | Authentication routes and middleware rely entirely on PostgreSQL database queries via `@suite/db` and verified JWT/HMAC session tokens. |
| **RSC Boundary Law** | **PASS** | Authentication payloads and cookie options reside in pure TypeScript modules (`@/lib/auth-constants.ts`, `@suite/auth`). |
| **RFC 7807 Problem Details** | **PASS** | All API contracts specify RFC 7807 problem details error responses with machine-readable `code` fields. |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-session-routing/
├── spec.md              # Feature specification (SPEC-AUTH-001)
├── plan.md              # This file (implementation plan)
├── research.md          # Architecture decisions & research findings
├── data-model.md        # Entities, Prisma mapping, & state machines
├── quickstart.md        # End-to-end validation scenarios & runbook
├── contracts/           # Interface and OpenAPI contracts
│   └── auth-openapi.json# OpenAPI 3.1 contract for all auth endpoints
└── tasks.md             # Task breakdown (created by /speckit-tasks)
```

### Source Code (repository layout)

```text
packages/auth/
├── src/
│   ├── auth.ts                     # Better-Auth engine configuration with passkey & organization plugins
│   ├── index.ts                    # Public package exports
│   ├── session/
│   │   ├── branch-context.ts       # Tenant and branch context tracking
│   │   ├── session-token.ts        # Cryptographic session token signing & verification
│   │   └── index.ts
│   └── sso/
│       ├── domain-discovery.ts     # Home Realm Discovery (HRD) enterprise domain resolver
│       ├── jit-provisioning.ts     # Enterprise JIT user provisioning
│       └── index.ts
└── tests/
    ├── auth.test.ts
    ├── branch-context.test.ts
    ├── sso-discovery.test.ts
    └── pin-engine.test.ts

apps/dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root HTML layout with zero-flash inline theme script
│   │   ├── globals.css             # DESIGN.md semantic tokens (:root & [data-theme="dark"])
│   │   ├── middleware.ts           # Next.js Edge route guard (Guest Guard, Onboarding, Tenant)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx          # Centered 400px auth layout (modal-sm)
│   │   │   ├── login/page.tsx      # Login gateway (Email, Social OAuth, SSO switch, Passkey)
│   │   │   ├── signup/page.tsx     # Registration gateway with password complexity validator
│   │   │   ├── forgot-password/page.tsx # Password recovery with 15m single-use token
│   │   │   ├── reset-password/page.tsx  # Password reset with global session invalidation
│   │   │   ├── link-account/page.tsx    # OAuth collision password verification challenge
│   │   │   ├── choose-tenant/page.tsx   # Multi-workspace disambiguation screen
│   │   │   └── verify-expired/page.tsx  # Expired verification handler with resend action
│   │   ├── (onboarding)/
│   │   │   ├── layout.tsx          # Centered onboarding container layout
│   │   │   ├── step-1/page.tsx     # Step 1: Workspace & Organization Setup
│   │   │   ├── step-2/page.tsx     # Step 2: Primary Branch & Operating Location
│   │   │   └── step-3/page.tsx     # Step 3: Application Selection & Activation
│   │   ├── (super-admin)/
│   │   │   ├── login/page.tsx      # Super Admin MFA login portal
│   │   │   └── page.tsx            # Global platform management console
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── logout/route.ts
│   │       │   ├── register/route.ts
│   │       │   ├── reset-password/route.ts
│   │       │   ├── link-account/route.ts
│   │       │   ├── sso/discover/route.ts
│   │       │   └── verify-email/
│   │       │       ├── request/route.ts
│   │       │       └── confirm/route.ts
│   │       ├── super-admin/
│   │       │   └── auth/login/route.ts # Super admin MFA authentication endpoint
│   │       └── v1/
│   │           ├── user/preferences/route.ts
│   │           ├── auth/switch-tenant/route.ts
│   │           └── onboarding/
│   │               ├── step-1/route.ts
│   │               ├── step-2/route.ts
│   │               └── step-3/route.ts
│   ├── components/
│   │   ├── auth/
│   │   │   ├── auth-card.tsx       # 400px envelope card container
│   │   │   ├── email-password-form.tsx # Interactive form with show/hide password toggle
│   │   │   ├── oauth-providers.tsx # Google, Microsoft, GitHub secondary buttons
│   │   │   ├── passkey-button.tsx  # WebAuthn navigator.credentials.get() trigger
│   │   │   └── sso-redirect-card.tsx
│   │   └── layout/
│   │       ├── header-topbar.tsx
│   │       └── unverified-email-banner.tsx # Persistent warning banner on dashboard
│   └── lib/
│       ├── auth-constants.ts       # Shared session payload encoding & cookie options
│       ├── route-dispatcher.ts     # Extensible resolvePostLoginRoute implementation
│       ├── oauth-registry.ts       # Extensible OAuthProviderRegistry (Open-Closed Principle)
│       └── turnstile.ts            # Cloudflare Turnstile verifier with non-prod test dummy mode
└── tests/
    └── auth-gate.test.tsx          # Comprehensive Vitest suite for routing & gate rules
```

---

## Complexity Tracking

> **Constitution Check**: Zero violations. All implementations use existing schemas and patterns.

| Area | Why Needed | Alternative Rejected Because |
| :--- | :--- | :--- |
| Server-side Edge Middleware Guard | Zero-trust verification of authentication and onboarding state before page render | Client-side `useEffect` checks cause perceptible visual flash and are easily bypassed |
| Zero-flash `<head>` Theme Script | Instant paint of correct OS/user theme on first byte | Pure CSS media queries cannot account for explicit database user preference overrides |
| Deferred Email Verification | Allows immediate onboarding progression without user drop-off | Hard blocking on email verification causes steep activation churn |
