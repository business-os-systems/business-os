# Research & Architecture Decisions: Identity, Authentication & Session Routing

**Feature**: `001-auth-session-routing`  
**Document ID**: `SPEC-AUTH-001`  
**Status**: Completed  
**Governing Documents**: `DESIGN.md` (Enterprise Business OS v2.0.0), `AGENTS.md`

---

## 1. Authentication Architecture & Gateway Integration

### Context & Requirements
`SPEC-AUTH-001` mandates a responsive single-card authentication gateway supporting four primary modalities:
1. Email and password credentials with real-time complexity validation and show/hide toggling.
2. Federated third-party OAuth (Google, Microsoft, GitHub).
3. Enterprise Single Sign-On (SSO) with Home Realm Discovery (HRD) automatically switching inputs when a managed enterprise domain is entered.
4. FIDO2 / WebAuthn passkeys for biometric and hardware key logins.

### Decision
- **Core Engine**: Extend the existing `@suite/auth` Better-Auth engine (`betterAuth` with `prismaAdapter`) configured against `@suite/db`.
- **Credential Storage**: Use `@node-rs/argon2` or scrypt hashes stored in the `Account` model with `providerId = "credential"`.
- **Passkey Support**: Enable Better-Auth `@better-auth/passkey` plugin mapped to the existing `Passkey` entity in `core.prisma` (`credentialID`, `publicKey`, `counter`, `transports`).
- **HRD (Home Realm Discovery)**: Integrate the existing `extractDomainFromEmail` and `resolveSsoDomain` from `@suite/auth/sso/domain-discovery` into an optimized debounced client hook and an API endpoint `POST /api/auth/sso/discover`.
- **Session Duration**: The `"Keep me signed in"` parameter switches the session cookie `maxAge` between ephemeral/session (`expiresAt: null` or session duration) and a persistent 30-day token (`maxAge: 30 * 24 * 60 * 60`).

### Alternatives Considered
- *NextAuth.js / Auth.js*: Rejected due to poor multi-tenant active organization switching and lack of native first-class Prisma multi-tenant adapter comparable to Better-Auth's organization plugin.
- *Supabase Auth / Clerk*: Rejected because Enterprise Business OS requires strict on-premise / self-hosted PostgreSQL tenancy isolation with zero external vendor lock-in.

---

## 2. Zero-Flash Theme Synchronization Architecture

### Context & Requirements
- Theme options: `system`, `light`, `dark`.
- Guests visiting `/signup`, `/login`, or `/forgot-password` must inherit OS preferences (`prefers-color-scheme: dark`) with zero visual flash (FOUT).
- Authenticated users must have their account-level preference (`system`, `light`, or `dark`) stored in `User.metadata.theme_preference` in PostgreSQL, synchronized across all devices and browsers upon login, and modifiable in real-time.

### Decision
- **Zero-Flash Head Script**: In `apps/dashboard/src/app/layout.tsx`, inject an inline blocking `<script>` in `<head>` that executes prior to DOM render:
  ```javascript
  (function() {
    try {
      const stored = localStorage.getItem("bos_theme");
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = stored === "dark" || (!stored && systemDark) ? "dark" : (stored === "light" ? "light" : (systemDark ? "dark" : "light"));
      if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.setAttribute("data-theme", "light");
      }
    } catch (e) {}
  })();
  ```
- **Authenticated Handshake**: Upon successful login, the API response payload returns `user.themePreference`. The client writes this to `localStorage.setItem("bos_theme", pref)` and updates `document.documentElement.setAttribute("data-theme", pref)`.
- **Real-Time Mutation**: When changed in user settings, the UI instantly toggles `data-theme` on `<html>`, writes to `localStorage`, and dispatches `PATCH /api/v1/user/preferences`.

### Alternatives Considered
- *Next-Themes (External library)*: Adds external runtime bundle weight and hydration edge-case issues in Next.js Server Components. A lightweight zero-dependency `<script>` is faster, 100% compliant with `DESIGN.md`, and eliminates hydration mismatch warnings.

---

## 3. Route Guard & Session State Machine

### Context & Requirements
The routing system must strictly govern transitions between:
1. Unauthenticated guest paths (`/login`, `/signup`, `/forgot-password`).
2. First-time onboarding progression (`/onboarding/step-[1-N]`).
3. Multi-workspace disambiguation (`/auth/choose-tenant`).
4. Protected dashboard workspace (`/dashboard`, `/sites`, etc.).

### Decision
- **Edge Middleware Inspection**: Implement route enforcement in `apps/dashboard/src/middleware.ts` using verified HMAC-SHA256 session tokens.
- **Routing Decision Rules**:
  1. **Rule 1 (Guest Guard)**: If `isAuthenticated && (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password')`:
     - If `onboardingStatus === 'COMPLETED'`: Redirect to `/dashboard` (or App Launcher `/`).
     - If `onboardingStatus !== 'COMPLETED'`: Redirect to `/onboarding/step-${currentOnboardingStep || 1}`.
  2. **Rule 2 (First-Time User / Onboarding Gate)**: On initial registration, `User.metadata.onboarding_status` is initialized to `"IN_PROGRESS"` and `current_onboarding_step: 1`. Client navigates via `history.replaceState` to `/onboarding/step-1` preventing back-navigation into `/signup`.
  3. **Rule 3 (Onboarding Protection)**: If authenticated user with `onboardingStatus !== 'COMPLETED'` visits `/dashboard` or any internal app URL, middleware intercepts and redirects to `/onboarding/step-${currentOnboardingStep || 1}`.
  4. **Rule 4 (Multi-Tenant Disambiguation)**: If an authenticated user belongs to multiple organizations (`user.organizations.length > 1`) and has no active tenant context (`!payload.organizationId`), route them to `/auth/choose-tenant` before granting dashboard access.

### Alternatives Considered
- *Client-side React Route Guards (`useEffect`)*: Vulnerable to content flash and bypass via direct URL manipulation. Server-side Edge Middleware provides ironclad zero-trust defense.

---

## 4. Deferred Email Verification & Marketplace Installation Gate

### Context & Requirements
- Registration does not block the user from entering the app or completing onboarding.
- A 24-hour cryptographic email verification token is generated and recorded in the database.
- Unverified users see an un-dismissible warning banner at the top of the dashboard.
- If an unverified user attempts to install or activate an application from the app marketplace:
  - Client UI blocks the action and displays a `modal-sm` (400px) Level 3 dialog requiring verification.
  - API endpoint `POST /api/v1/apps/:id/install` rejects requests with `403 Forbidden` (`{"code": "EMAIL_VERIFICATION_REQUIRED"}`).

### Decision
- **Verification Token Generation**: Utilize the existing `Verification` model in `@suite/db` (`identifier = email`, `value = sha256(cryptoRandomHex)`, `expiresAt = now() + 24 hours`).
- **Dashboard Warning Banner**: A persistent client component in `apps/dashboard/src/components/layout/unverified-email-banner.tsx` checks `user.emailVerified`. If `false`, it renders a semantic warning banner using `DESIGN.md` token `bg-status-warning/15 text-status-warning-text border-status-warning/30` with a `"Resend verification email"` action.
- **Installation Gate**:
  - In `apps/api/src/routes/apps.ts` (and dashboard API proxy), wrap app installation endpoints with an `enforceEmailVerified` middleware checking `req.user.emailVerified`.
  - In frontend marketplace cards, intercept the "Install" click if `!user.emailVerified` and launch the `EmailVerificationRequiredDialog` (`modal-sm`).

### Alternatives Considered
- *Hard blocking registration until email is verified*: Causes steep drop-off in user onboarding. Deferred verification with strict marketplace installation gating balances frictionless activation with enterprise anti-abuse posture.

---

## 5. Account Linking & Collision Defense Flow

### Context & Requirements
- If a user signs up with `email + password`, and subsequently attempts to sign in via Google or Microsoft OAuth using that exact same email address:
  - Do NOT silently merge accounts.
  - Intercept the OAuth callback and redirect to `/auth/link-account`.
  - Present the user with an account-linking challenge requiring their password to verify identity before linking the OAuth provider in `Account`.

### Decision
- **Callback Hook**: Better-Auth `socialProviders` pre-link event hook checks if an account already exists with `providerId = "credential"` for the OAuth email.
- **Verification Flow**: If collision occurs, store an ephemeral OAuth linking ticket in Redis/DB (expiring in 5 minutes) and redirect to `/auth/link-account?ticket=${linkingTicket}`.
- Upon successful password validation against `dbUser.accounts[credential]`, append the new OAuth provider record to `Account` and finalize the session.

---

## 6. Cross-Platform Native Session Governance (Desktop & Mobile)

### Context & Requirements
- Support Web, Desktop (Tauri/Electron), and Mobile (iOS/Android).
- Web uses `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
- Native clients store session tokens securely in OS keychains (macOS Keychain, Windows Credential Manager, iOS Keychain, Android Keystore).
- OAuth in native clients opens external system browser with loopback redirects (`http://127.0.0.1:{port}`) or custom protocol URI (`businessos://auth/callback`).
- Offline handling on native app startup displays an offline screen with `"Retry connection"`.

### Decision
- **Standard Token Protocol**: Session tokens are signed HMAC-SHA256 tokens containing the tenant context payload.
- **Dual Transport Support**: `packages/auth/src/session/session-token.ts` already supports extracting tokens from both `Cookie: suite_session=...` and `Authorization: Bearer <token>`.
- **Client Offline State**: A universal offline detector hook (`useNetworkStatus`) renders the standard `OfflineView` using `bg-background` and `DESIGN.md` spacing when `navigator.onLine === false`.

---

## 7. 3-Step Platform Onboarding Pipeline Architecture

### Context & Requirements
Clarification confirmed a 3-step platform onboarding pipeline:
- Step 1: Workspace & Organization Setup (`/onboarding/step-1`) → provisions `Organization`, sets user as `Owner`.
- Step 2: Primary Branch & Operating Location (`/onboarding/step-2`) → provisions `Branch`, creates `UserBranchRole`.
- Step 3: Application Selection & Workspace Activation (`/onboarding/step-3`) → provisions initial app licenses, sets `onboarding_status: "COMPLETED"`, redirects to `/dashboard`.

### Decision
- Each step is served as an independent route under `apps/dashboard/src/app/(onboarding)/step-[1-3]`.
- Backed by atomic transactional endpoints `POST /api/v1/onboarding/step-1`, `step-2`, and `step-3`.
- Next.js Edge middleware enforces sequential access (`onboarding_status === "IN_PROGRESS"` bounces forward/backward to `User.metadata.current_onboarding_step`).

---

## 8. RBAC Dynamic Dashboard & Single-App Direct Handoff Dispatcher

### Context & Requirements
- Single-organization users bypass `/auth/choose-tenant` and auto-select active context.
- Different roles (Admin, Manager, Employee, Intern) must see dynamically filtered dashboard views according to their permissions.
- In future multi-app deployments, frontline users with access to exactly one app (e.g. POS-only or CRM-only) should be fast-tracked directly into that app without an intermediate dashboard stop.

### Decision
- Introduce an extensible `resolvePostLoginRoute(userRole, userPermissions, installedApps)` in `apps/dashboard/src/lib/route-dispatcher.ts`.
- If user has permissions for >1 app or administrative privileges: returns `/dashboard`.
- If user has permissions for exactly 1 app: returns that app's root route (e.g., `/pos`).
- Dashboard App Launcher dynamically maps available app cards against `user.permissions`.

---

## 9. Bot Defense & Test Determinism (Cloudflare Turnstile)

### Context & Requirements
- Production sign-in/up requires Turnstile bot defense.
- Local dev and automated CI testing must run fast, reliably, and offline without external API dependencies.

### Decision
- Standardize on Cloudflare's official dummy pass keys (`1x00000000000000000000AA` / `2x00000000000000000000AB`) when `NODE_ENV !== "production"`.
- Token verifier module (`apps/dashboard/src/lib/turnstile.ts`) intercepts dummy keys in non-production, returning immediate validation success without network calls.
