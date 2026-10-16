# Enterprise Code Review & Architectural Audit: Authentication Sprint
**Branch:** `dev`  
**Base Commit (Fixed Point):** `cf7fbdd` (*Merge pull request #115 from business-os-systems/feat/#112-design-tokens-theme*)  
**Target Commit:** `fd7e538` (*HEAD*)  
**Scope:** Auth Sprint (Tickets #116, #117, #118, #119, #120, #121, #122, #123)  
**Status:** Deep Audit Complete — Zero Code Modified (Awaiting Human Review)

---

## 1. Executive Summary

A comprehensive dual-axis architectural and security code review was performed on all 101 files modified during the Auth sprint (`cf7fbdd...HEAD`). 

- **Total Issues Identified:** 21 issues across 5 core categories.
- **Critical / High Security Vulnerabilities:** 2 issues (Unverified session token decoding in email request, Broken Access Control in app installation).
- **Standards & Directive Violations:** 3 issues (`DESIGN.md` hardcoded hex colors, Edge middleware route omissions, Undocumented Next.js API endpoints).
- **SOLID Principle Violations:** 4 issues (SRP in route handlers, OCP in hardcoded fallbacks, LSP in silent transporter fallback, DIP in direct Prisma/Redis couplings).
- **Spec Gaps & Functional Discrepancies:** 5 issues (Passkey client verification missing, Turnstile frontend missing, native platform storage missing, rolling session refresh missing, audit logs missing).
- **Clean Code & Fowler Smells:** 7 issues (Duplicated session parsing, Middle-man shims, Feature Envy on JSON metadata, Primitive Obsession on lifecycle status).

---

## 2. Standards Review (Axis 1)

*Evaluates compliance against repository rules (`AGENTS.md`), design system (`DESIGN.md`), and enterprise engineering standards.*

| Standard Rule | Violation / Observation | Severity |
| :--- | :--- | :--- |
| **`AGENTS.md §5` DESIGN.md Primacy Law** | `apps/dashboard/src/app/onboarding/step-3/page.tsx:41–52` defines raw hex colors (`bg-[#F59E0B]`, `bg-[#10B981]`, etc.) directly in UI components instead of semantic tokens (`brand`, `action`, `warning`, `success`). | **HIGH** |
| **`AGENTS.md §5` Public Auth Whitelist Law** | `apps/dashboard/src/middleware.ts:25–33` omits `/verify-expired` from `isAuthenticationRoute()`. When an unauthenticated guest clicks an expired link (>24h), `/api/auth/verify-email/confirm` redirects to `/verify-expired`, but Edge middleware intercepts and forces a redirect to `/login?redirect=/verify-expired`. | **HIGH** |
| **`AGENTS.md §5` OpenAPI Registration Law** | `apps/dashboard/src/app/api/v1/onboarding/*` and `apps/dashboard/src/app/api/v1/apps/[id]/install/route.ts` are standalone Next.js App Router handlers rather than routes declared via `@hono/zod-openapi`'s `createRoute()`. | **MEDIUM** |
| **Fowler Smell: Duplicated Code** | Boilerplate for reading `SESSION_COOKIE_NAME`, running `verifySessionToken()`, and decoding payload is duplicated identically across >7 route handlers. | **MEDIUM** |
| **Fowler Smell: Middle Man** | `apps/dashboard/src/app/api/v1/auth/sso/[id]/login/route.ts` and `discover/route.ts` are 1-line re-export shims that delegate onward without adding behavior. | **LOW** |

---

## 3. Specification Review (Axis 2)

*Evaluates implementation fidelity against `specs/001-auth-session-routing/spec.md` (`SPEC-AUTH-001`).*

| Spec Requirement | Spec Reference | Finding | Impact |
| :--- | :--- | :--- | :--- |
| **Passkey Authentication** | Line 109 | `PasskeyButton.tsx` triggers `navigator.credentials.get()` with a purely client-generated random challenge and no server endpoint verification. In `login/page.tsx`, no `onSuccess` callback is passed. | Clicking "Sign in with Passkey" completes the WebAuthn browser prompt but performs no authentication. |
| **Turnstile Bot Defense** | Line 157 | Spec requires Turnstile bot defense on `/login`, `/signup`, and `/forgot-password`. Frontend forms do not render or execute the Turnstile widget. `/api/auth/forgot-password/route.ts` omits Turnstile check. | Bot protection is bypassed on password reset and only passively validated on login/register if token provided. |
| **Rolling Session Expiration** | Line 113 | Spec specifies 24-hour default *rolling* session expiration for ephemeral logins. Expiration in cookie is static from issuance; `middleware.ts` never slides or refreshes the cookie on activity. | Users are logged out after 24 hours of continuous active use. |
| **Audit Logging** | Lines 119, 154 | Spec requires security audit log events for password reset and account linking. No audit log table or service is invoked. | Missing enterprise compliance trail for credential mutations. |
| **Scope Creep / Duplicate Code** | N/A | `apps/api/src/routes/auth.ts` contains 481 lines duplicating SSO discovery, email verification, and branch switching already handled in `@suite/dashboard`. Also introduced unrequested `VerifiedSuccessBanner`. | Duplicate surface area and maintenance overhead. |

---

## 4. Comprehensive Issues Matrix: Security, SOLID, Clean Code & Best Practices

The table below catalogs all identified issues with precise root cause analysis and prescribed remediations:

| Issue ID | Category | Affected File(s) | Description | Root Cause / Risk | Recommended Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Security (Critical)** | `apps/dashboard/src/app/api/auth/verify-email/request/route.ts` (L24–30) | Unverified session cookie payload decoding. | `decodeSessionPayload(sessionCookie)` is called without `await verifySessionToken(sessionCookie)`. An attacker can forge an unsigned cookie with any email address and trigger verification emails or exhaust rate limits. | Prepend `const isValid = await verifySessionToken(sessionCookie); if (!isValid) targetEmail = undefined;` before decoding. |
| **SEC-02** | **Security (High)** | `apps/dashboard/src/app/api/v1/apps/[id]/install/route.ts` (L56–74) | Broken Access Control (BAC) on Marketplace App Installation. | The endpoint validates that `user.emailVerified === true`, but performs **no RBAC or authorization check**. Any member (read-only guest or employee) can install modular applications across the entire tenant workspace. | Check user permissions for `apps:install` or verify role is `"owner"`/`"admin"` in `userBranchRole` before allowing `prisma.installedApp.upsert`. |
| **SEC-03** | **Security (Medium)** | `apps/dashboard/src/app/api/auth/sso/[id]/login/route.ts` (L38–40) | Potential Open Redirect on IdP authorization URL. | `NextResponse.redirect(new URL(ssoConfig.authUrl))` blindly redirects to whatever URL is stored in `ssoConnection.config`. If malicious or misconfigured, it can redirect users to an attacker domain. | Enforce URL protocol to `https:` and validate hostname matches expected enterprise IdP domains (e.g. `login.microsoftonline.com`, `accounts.google.com`, Okta domains). |
| **SEC-04** | **Security (Medium)** | `apps/dashboard/src/app/api/auth/forgot-password/route.ts` & `verify-email/request/route.ts` | Complete rate limit bypass when Redis is unreachable. | The `try/catch` block around `redis.incr` catches connection errors and fails open without rate limiting. If Redis is down, an attacker can flood thousands of emails per second. | Implement a degraded in-process sliding window or circuit-breaker flag that limits request rate when Redis is disconnected. |
| **SEC-05** | **Security (Low/Med)** | `packages/auth/src/session/session-token.ts` (L183–218) | Lack of key versioning/identifier (`kid`) in HMAC session token. | Session token format `${payload}.${signature}` uses a single global `BETTER_AUTH_SECRET`. Secret rotation immediately invalidates all active sessions globally without grace period. | Incorporate a key version identifier in token header (e.g. `v1.${payload}.${sig}`) to support graceful secret rotation. |
| **SOLID-01** | **SOLID: SRP** | `apps/dashboard/src/app/api/auth/login/route.ts` & `onboarding/step-1/route.ts` | Route handlers violate Single Responsibility Principle. | Handlers directly orchestrate input validation, Turnstile verification, multi-table Prisma queries, password hashing, permission aggregation loops, cookie serialization, and response formatting in 250+ line files. | Extract orchestration into domain services (`AuthService.authenticate()`, `OnboardingService.bootstrapTenant()`), keeping route handlers as thin controllers. |
| **SOLID-02** | **SOLID: OCP** | `apps/dashboard/src/app/api/v1/onboarding/complete/route.ts` (L115) & `packages/auth/src/sso/domain-discovery.ts` (L4–19) | Hardcoded domain lists and application fallbacks. | `complete/route.ts` hardcodes `["website-builder"]` as a static fallback. `domain-discovery.ts` hardcodes a static `PUBLIC_EMAIL_DOMAINS` Set. Adding new apps or public email providers requires modifying core code. | Move public domains and default onboarding apps to database configuration or extensible provider registries (`OAuthRegistry` pattern). |
| **SOLID-03** | **SOLID: LSP** | `packages/auth/src/email/transporter.ts` (L100–108) | Silent transporter fallback violates Liskov Substitution Principle. | If `EMAIL_PROVIDER="resend"` but `RESEND_API_KEY` is missing or invalid in production, `resolveEmailTransporter()` silently falls back to `ConsoleEmailTransporter`, logging to stdout and returning `success: true`. Emails are lost silently. | In production, `resolveEmailTransporter()` must throw a configuration error if the requested provider's credentials are missing. |
| **SOLID-04** | **SOLID: DIP** | `apps/dashboard/src/app/api/**/*.ts` | High-level route handlers directly depend on low-level database singletons. | Route handlers import and execute concrete `prisma` and `redis` singletons directly rather than depending on repository abstractions. | Introduce repository/service interfaces (`UserRepository`, `OrganizationRepository`, `CacheClient`) to decouple controllers from database ORM details and simplify unit testing. |
| **CODE-01** | **Clean Code (Smell)** | `apps/dashboard/src/app/api/v1/**/*.ts` | Duplicated session extraction and validation boilerplate. | Session cookie retrieval, signature verification, payload decoding, and RFC 7807 401 error construction are duplicated across 7 separate route files (25–30 lines each). | Create a centralized helper `getAuthenticatedSession(request: NextRequest)` returning `Result<SessionPayload, NextResponse>`. |
| **CODE-02** | **Clean Code (Smell)** | `login/route.ts`, `link-account/route.ts`, `tenant-context.ts` | Duplicated permission aggregation loops. | Iterating `branchRoles`, checking null branch IDs, and flattening `rp.permission?.action` into a `Set<string>` is duplicated in 3 different files. | Extract a shared utility `extractEffectivePermissions(branchRoles)` in `@suite/auth`. |
| **CODE-03** | **Clean Code (Smell)** | `login/route.ts`, `onboarding/step-1/route.ts` | Feature Envy on User Metadata JSON. | Routes repeatedly cast `user.metadata` to `Record<string, unknown>` and reach into `onboarding_status`, `current_onboarding_step`, `active_organization_id`. | Encapsulate user metadata operations in typed domain helper functions (`getUserOnboardingState(user)`, `updateUserOnboardingState(tx, userId, state)`). |
| **CODE-04** | **Clean Code (Smell)** | Monorepo-wide | Primitive Obsession on lifecycle status and role slugs. | Strings `"NOT_STARTED"`, `"IN_PROGRESS"`, `"COMPLETED"`, `"owner"`, `"member"` are passed as raw string literals across routes and client components. | Define canonical TypeScript `const enum` or Zod enums (`OnboardingStatus`, `PlatformRole`) in `@suite/core` or `@suite/auth`. |
| **SPEC-01** | **Spec Gap** | `apps/dashboard/src/components/auth/passkey-button.tsx` & `login/page.tsx` | Incomplete WebAuthn Passkey integration. | The button triggers `navigator.credentials.get()`, but does not communicate with any backend passkey verification route. `login/page.tsx` does not supply `onSuccess`. | Implement `@better-auth/passkey` backend verification endpoints or wire up a passkey verification route `/api/auth/passkey/verify`. |
| **SPEC-02** | **Spec Gap** | `apps/dashboard/src/components/auth/email-password-form.tsx` & `forgot-password/page.tsx` | Cloudflare Turnstile widget missing in UI. | Frontend forms lack the Turnstile widget element (`<Turnstile />`), meaning `turnstileToken` is never submitted by human users. | Mount Turnstile challenge component in `EmailPasswordForm` and `ForgotPasswordPage`, passing generated token in submission payloads. |
| **SPEC-03** | **Spec Gap** | `apps/dashboard/src/middleware.ts` (L80–125) | Missing rolling session sliding window. | SPEC-AUTH-001 Section 4.2 specifies 24-hour rolling expiration. Middleware only reads the cookie without updating `Set-Cookie` with refreshed expiration on incoming requests. | In `createAuthenticatedResponse()`, refresh session cookie `maxAge` on requests if more than 1 hour has elapsed since last issue. |
| **SPEC-04** | **Spec Gap** | `apps/dashboard/src/app/api/auth/reset-password/route.ts` & `link-account/route.ts` | Missing security audit trail. | Spec requires writing audit log entries upon password reset and account linking. Neither handler emits audit records. | Invoke `auditLogger.log({ action: "AUTH_PASSWORD_RESET", userId, ip, timestamp })`. |
| **SPEC-05** | **Architecture** | `apps/dashboard/src/middleware.ts` & `choose-tenant/page.tsx` | Multi-tenancy route path inconsistency. | Spec refers to `/auth/choose-tenant`, while implementation uses `/choose-tenant`. Middleware does not automatically redirect users with multiple tenants when `active_organization_id` is unset. | Align on `/choose-tenant` in spec and route guard, and ensure middleware directs multi-tenant users without active workspace to tenant selector. |
| **STYLE-01** | **Design / Styling** | `apps/dashboard/src/app/onboarding/step-3/page.tsx` (L41–52) | Direct hex color codes violate DESIGN.md Primacy Law. | Raw Tailwind hex classes (`bg-[#F59E0B]`, `bg-[#10B981]`, `bg-[#6366F1]`) used for app category badges. | Replace with semantic color token utility classes (`bg-brand-tint text-brand-text`, `bg-action-tint text-action-text`, etc.). |
| **ROUTING-01** | **Edge Middleware** | `apps/dashboard/src/middleware.ts` (L25–33) | Missing `/verify-expired` in authentication routes whitelist. | When an expired verification link is clicked, `/api/auth/verify-email/confirm` redirects to `/verify-expired`, which is rejected by middleware as unauthenticated. | Add `pathname.startsWith("/verify-expired")` to `isAuthenticationRoute()`. |

---

## 5. Recommended Action Plan (Post-Approval)

When authorized to make changes, remediations should be executed in three prioritized phases:

### Phase 1: P0 Security & Edge Middleware Fixes
1. **Fix SEC-01:** Add `verifySessionToken()` check before decoding session in `apps/dashboard/src/app/api/auth/verify-email/request/route.ts`.
2. **Fix SEC-02:** Add authorization guard in `apps/dashboard/src/app/api/v1/apps/[id]/install/route.ts` ensuring caller has tenant management permissions.
3. **Fix ROUTING-01:** Whitelist `/verify-expired` in `apps/dashboard/src/middleware.ts`.
4. **Fix STYLE-01:** Remove raw hex color codes from `apps/dashboard/src/app/onboarding/step-3/page.tsx` and replace with DESIGN.md semantic tokens.

### Phase 2: SOLID & Clean Code Refactoring
1. **Fix CODE-01 & SOLID-01:** Extract `getAuthenticatedSession()` helper to remove 200+ lines of duplicated session boilerplate across `api/v1` routes.
2. **Fix CODE-02:** Extract shared `extractEffectivePermissions()` utility in `@suite/auth`.
3. **Fix SOLID-03:** Prevent silent fallback to console transporter in production.

### Phase 3: Specification Gaps
1. **Fix SPEC-01 & SPEC-02:** Wire backend verification for Passkeys and mount Turnstile client component on forms.
2. **Fix SPEC-03:** Implement rolling session cookie renewal in Edge middleware.
3. **Fix SPEC-04:** Add audit logging to password reset and account linking mutations.
