# Business OS — Identity, Authentication, Session Management & Route Guard Architecture

**Document Reference**: `DOC-AUTH-001`  
**System Classification**: Platform Core Tier-1 Critical Subsystem  
**Implementation Modules**: `packages/auth`, `apps/dashboard`, `@suite/db`, `@suite/redis`  
**Status**: Production Ready  

---

## 1. Executive Architecture & System Topology

The Business OS Authentication and Session Routing architecture provides a zero-trust, enterprise-grade identity layer designed for high-security multi-tenant business operations. It combines:
- **Zero-Flash OS Theme Synchronization**: Instant client-side canvas and CSS variable hydration matching the host OS appearance without layout shift or visual flashing.
- **Unified Tri-Modal Authentication Gateway**: Biometric Passkeys (WebAuthn/FIDO2), Federated OAuth 2.0 / OIDC, and high-memory Argon2id credential verification.
- **Automated Home Realm Discovery (HRD)**: Real-time corporate domain discovery seamlessly switching password challenges to enterprise SAML 2.0 / OIDC Identity Providers.
- **Edge Middleware Route Dispatcher**: Multi-stage state machine enforcing authentication gates, tenant isolation, and onboarding progression in Edge runtimes before page execution.
- **Deferred Email Verification Engine**: 24-hour cryptographic token lifecycle allowing uninterrupted onboarding while gating high-privilege app store installations.
- **Account Security & Global Session Revocation**: 15-minute single-use password reset tokens with immediate global revocation of all active sessions in PostgreSQL across all browsers and devices.
- **OAuth Collision Defense**: Cryptographically signed HMAC-SHA256 linking tickets preventing account takeover and ensuring zero silent account merging.

```
                                 [ Client Browser / Native Shell ]
                                                 │
                                                 ▼
                                     [ Edge Middleware Guard ]
                                  (apps/dashboard/src/middleware.ts)
                                                 │
                 ┌───────────────────────────────┴──────────────────────────────┐
                 ▼                                                              ▼
        [ Public / Guest Gate ]                                      [ Authenticated Gate ]
   - /login, /signup, /forgot-password                         - Session HMAC signature check
   - Zero-Flash OS Theme Detection                             - Token expiration validation
   - Bot Mitigation (Turnstile)                                - Multi-tenant context check
                 │                                                              │
                 ▼                                                              ▼
   ┌───────────────────────────┐                              ┌───────────────────────────────────┐
   │ Authentication Handshakes │                              │ Route State Machine Dispatcher    │
   ├───────────────────────────┤                              ├───────────────────────────────────┤
   │ • WebAuthn / Passkeys     │                              │ • Onboarding (Step 1 -> 2 -> 3)   │
   │ • Argon2id Credentials    │                              │ • Multi-Workspace Chooser         │
   │ • SAML / OIDC Enterprise  │                              │ • Single-App Direct Handoff (POS) │
   │ • OAuth Collision Defense │                              │ • Executive Dashboard Launcher    │
   └─────────────┬─────────────┘                              └─────────────────┬─────────────────┘
                 │                                                              │
                 ▼                                                              ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │                          Platform Kernel & Data Plane Integration                            │
   │   • PostgreSQL Sessions & Accounts (@suite/db)    • Pluggable SMTP / Resend / Console        │
   │   • Redis Sliding-Window Rate Limiting            • Cryptographic SHA-256 Audit Records      │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Session Context & Interface Segregation (ISP)

To eliminate bloated interfaces and prevent orthogonal domain coupling, all session contexts strictly adhere to the **Interface Segregation Principle (ISP)** and **Single Responsibility Principle (SRP)**.

### 2.1 Granular Context Segregation

```typescript
// Core User Identity Context (SRP)
export interface UserIdentityContext {
  userId: string;
  email: string;
  userName: string;
}

// Tenant Boundary Execution Context (SRP)
export interface TenantSessionContext {
  organizationId: string;
  organizationName: string;
  activeBranchId?: string;
  activeBranchName?: string;
}

// Authorization & Privilege Matrix Context (SRP)
export interface SessionAuthorizationContext {
  role?: string;
  permissions?: string[];
}

// Temporal Lifecycle Bounds Context (SRP)
export interface SessionLifecycleContext {
  timestamp: number;
  expiresAt?: number;
}

// Personalization Preferences Context (SRP)
export interface SessionPreferencesContext {
  themePreference?: "system" | "light" | "dark";
}

// Onboarding Pipeline Lifecycle Context (SRP)
export interface SessionOnboardingContext {
  onboardingStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentOnboardingStep?: number | null;
}

// Consolidated Composite Session Payload
export interface SessionPayload
  extends UserIdentityContext,
    Partial<TenantSessionContext>,
    SessionAuthorizationContext,
    SessionLifecycleContext,
    SessionPreferencesContext,
    SessionOnboardingContext {}
```

### 2.2 Cryptographic Session Tokens & Cookie Security

Session tokens are signed via HMAC-SHA256 (`BETTER_AUTH_SECRET`) and formatted as:
$$\text{token} = \text{base64url}(\text{JSON}(\text{payload})) \,\|\, "." \,\|\, \text{base64url}(\text{HMAC-SHA256}(\text{payload}, \text{secret}))$$

- **Ephemeral Sessions ("Keep me signed in" unchecked)**: 24-hour default rolling expiration (`maxAge: 86400`).
- **Persistent Sessions ("Keep me signed in" checked)**: 30-day extended expiration (`maxAge: 2592000`).
- **Cookie Security Attributes**: `HttpOnly; Secure; SameSite=Lax; Path=/`.

---

## 3. Core Security Subsystems

### 3.1 Deferred Email Verification & Marketplace Installation Gate
- **Registration**: Users register and immediately receive an onboarding session without blocking UI flow.
- **Token Dispatch**: 24-hour cryptographic token generated via SHA-256 hash storage in `verifications` table.
- **Rate Limiting**: Server-side Redis sliding window limits requests to max 5 per hour per email (HTTP 429). Client-side cooldown timer enforces 60-second intervals between clicks.
- **Top Dashboard Warning Banner**: Rendered in persistent warning tint (`bg-warning/10 border-warning/30`) with live countdown timer.
- **App Marketplace Gate**: Unverified users attempting app installation encounter a Level 3 modal (`modal-sm`, `400px`) and `POST /api/v1/apps/[id]/install` rejects with `HTTP 403 EMAIL_VERIFICATION_REQUIRED`.

### 3.2 Account Security, Password Reset & Global Session Revocation
- **Recovery Request (`POST /api/auth/forgot-password`)**:
  - Redis rate limited to max 5 requests per hour.
  - Generates 15-minute single-use token in `verifications`.
  - Dispatches email via pluggable transporter (`console`, `resend`, or `smtp`).
  - Returns opaque success message preventing user email enumeration.
- **Reset Execution (`POST /api/auth/reset-password`)**:
  - Enforces 8+ characters, uppercase, number, and special symbol via `validatePasswordComplexity`.
  - Hashes new password with Argon2id ($m=65536, t=3, p=4$).
  - Consumes single-use token.
  - **Global Revocation Law**: Executes `tx.session.deleteMany({ where: { userId } })`, immediately revoking and ejecting all active sessions across all devices and browsers globally.
  - Issues fresh session cookie for current client and redirects to `/dashboard`.

### 3.3 OAuth Collision Defense (`POST /api/auth/link-account`)
- **Collision Detection**: When a user signs in via OAuth (Google, Microsoft, GitHub) with an email belonging to an existing credential user, silent auto-merging is **strictly prohibited**.
- **Challenge Ticket**: The OAuth callback intercepts the collision and issues a 5-minute cryptographically signed ticket:
  $$\text{ticket} = \text{base64url}(\text{payload}) \,\|\, "." \,\|\, \text{base64url}(\text{HMAC-SHA256}(\text{payload}, \text{secret}))$$
- **Challenge Page (`/link-account?ticket=...`)**: Centered 400px `AuthCard` prompting for existing password.
- **Resolution**: Successful password verification creates the federated `Account` record, links provider to the user, and signs in without account takeover risk.

---

## 4. API & Route Reference

| Endpoint | Method | Status | Description | RFC 7807 Problem Code |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth/login` | POST | 200 / 401 | Credential and passkey authentication | `/errors/invalid-credentials` |
| `/api/auth/register` | POST | 201 / 400 | User registration & tenant onboarding bootstrap | `/errors/email-already-exists` |
| `/api/auth/logout` | POST | 200 | Session revocation & cookie clearance | — |
| `/api/auth/sso/discover` | POST | 200 | Home Realm Discovery email domain check | `/errors/validation-failed` |
| `/api/auth/verify-email/request` | POST | 200 / 429 | Verification token dispatch with rate limiting | `/errors/rate-limit-exceeded` |
| `/api/auth/verify-email/confirm` | GET | 307 / 410 | Verifies token and marks email verified | `/errors/token-expired` |
| `/api/auth/forgot-password` | POST | 200 / 429 | Dispatches 15m password recovery link | `/errors/rate-limit-exceeded` |
| `/api/auth/reset-password` | POST | 200 / 400 | Updates password and revokes all active sessions | `/errors/invalid-token` |
| `/api/auth/link-account` | GET / POST | 200 / 401 | OAuth collision challenge verification & linking | `/errors/invalid-ticket` |
| `/api/v1/auth/tenants` | GET | 200 | Lists active workspace memberships for user | `/errors/unauthorized` |
| `/api/v1/auth/switch-tenant` | POST | 200 | Sets active tenant boundary in session cookie | `/errors/workspace-access-denied` |
| `/api/v1/onboarding/step-1` | POST | 200 / 400 | Creates Organization, Branch, Role, and Owner | `/errors/slug-already-exists` |
| `/api/v1/onboarding/check-slug` | GET | 200 | Live slug availability check | — |
| `/api/v1/onboarding/step-2` | POST | 200 | Persists selected applications | `/errors/validation-failed` |
| `/api/v1/onboarding/complete` | POST | 200 | Provisions `InstalledApp` licenses and completes | `/errors/internal-error` |
| `/api/v1/apps/[id]/install` | POST | 200 / 403 | App installation gated by email verification | `/errors/email-verification-required` |

---

## 5. UI Presentation & Accessibility Standards

- **Envelope Card Encapsulation**: All branding, headings, form inputs, OAuth buttons, and navigation links reside strictly **inside** the 400px envelope container (`AuthCard`).
- **Zero-Scroll Viewport Presentation**: Auth card layouts maintain compact vertical rhythm ensuring zero vertical scrollbars on standard 100% desktop/laptop viewports.
- **Design Tokens**: Strict adherence to `DESIGN.md` visual tokens (`text-text`, `text-secondary`, `bg-surface`, `bg-action`, `border-border`, `shadow-level-2`).
- **Accessibility & Keyboard Navigation**:
  - All form inputs utilize `aria-invalid` bound to live validation state.
  - Form error alerts define `role="alert"` and link to inputs via `aria-describedby`.
  - Password visibility toggle buttons and submit actions enforce minimum **44x44px touch targets**.
  - Full keyboard navigation supported across form controls, focus rings, and action buttons.

---

## 6. Quickstart Runbook Automated Verification Matrix

The 8 end-to-end scenarios specified in `quickstart.md` are continuously verified by automated Vitest test suites:

| Scenario | Scenario Name | Primary Target Route | Automated Vitest Test Suite | Verification Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Unauthenticated Guest Theme Auto-Detection | `/login`, `/signup` | `apps/dashboard/tests/auth-gate.test.tsx` | **PASS (Automated)** |
| **2** | User Registration & Onboarding Gate | `/signup` $\rightarrow$ `/onboarding/step-1` | `apps/dashboard/tests/onboarding.test.tsx` | **PASS (Automated)** |
| **3** | Enterprise Home Realm Discovery (HRD) | `/login` (SSO Discover) | `apps/dashboard/tests/sso-flow.test.tsx` | **PASS (Automated)** |
| **4** | Deferred Verification & Marketplace Gate | `/dashboard`, `/api/v1/apps/[id]/install` | `apps/dashboard/tests/email-verification.test.tsx` | **PASS (Automated)** |
| **5** | Multi-Tenant Disambiguation & Chooser | `/choose-tenant`, `/dashboard` | `apps/dashboard/tests/tenant-switcher.test.tsx` | **PASS (Automated)** |
| **6** | Explicit Sign-Out & Back-Navigation Guard | Topbar Logout $\rightarrow$ `/login` | `apps/dashboard/tests/auth-gate.test.tsx` | **PASS (Automated)** |
| **7** | Password Reset & Global Session Invalidation | `/reset-password` | `apps/dashboard/tests/account-security.test.tsx` | **PASS (Automated)** |
| **8** | Organization Invitation Fast-Track Bypass | `/invite/[token]` | `apps/dashboard/tests/auth-gate.test.tsx` | **PASS (Automated)** |

---

## 7. Verification Summary
- **Unit & Integration Tests**: 165 tests in `@suite/dashboard`, 59 tests in `@suite/auth`, 70 tests in `@suite/api`.
- **Static Analysis & Type Safety**: 100% TypeScript compilation (`tsc --noEmit`) and ESLint validation across all workspace packages.
