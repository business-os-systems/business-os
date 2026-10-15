# Feature Specification: Identity, Authentication & Session Routing

**Document ID:** `SPEC-AUTH-001`  
**Revision:** `1.0.0 (Final)`  
**Status:** Approved for Implementation  
**Governing Document:** `DESIGN.md` (Enterprise Business OS v2.0.0)  
**Target Environments:** Web (`web-desktop`, `web-tablet`, `web-mobile`), Native Desktop (Tauri/Electron), Native Mobile (iOS/Android)

---

## 1. Executive Summary & Scope

`SPEC-AUTH-001` is the authoritative specification for the identity, authentication, session lifecycle, and route gating infrastructure across Enterprise Business OS. It codifies:
- A responsive, accessible single-card authentication gateway supporting email/password, social OAuth, enterprise SSO, and FIDO2/WebAuthn passkeys.
- Strict route guards handling the transition between guest access, sequential onboarding steps, and the existing dashboard application.
- Cross-platform theme synchronization adhering to `DESIGN.md` tokens across light and dark modes.
- A deferred email verification model that permits onboarding completion while guarding downstream marketplace application installation.
- Enterprise multi-tenancy selection, account collision mitigation, and device-level session governance.

---

## Clarifications

### Session 2026-10-15
- Q: What exact step sequence and total step count comprise the platform onboarding pipeline (`/onboarding/step-N`) before transitioning a user's status to `COMPLETED`? → A: Option A (3 Steps: Step 1 Workspace/Organization Setup, Step 2 Default Branch & Location Setup, Step 3 Initial App Selection & Workspace Activation). Detailed input fields, validations, and payloads defined in Section 6.3.
- Q: Which third-party OAuth providers should be rendered as active default sign-in options on the single-card authentication gateway? → A: Option B (Google, Microsoft, GitHub) as active launch providers, backed by an extensible `OAuthProviderRegistry` interface (Open-Closed Principle) allowing future providers (e.g. Apple, GitLab) to register handlers and SVG icons via configuration without touching core authentication routing.
- Q: What exact lifespan and cookie expiration policy should apply when a user leaves "Keep me signed in" unchecked? → A: Option A (24-Hour Rolling Expiration, maxAge: 86400). System-governed via configurable environment defaults (`SESSION_EPHEMERAL_MAX_AGE_SECONDS`), with architectural support for tenant/user custom timeout overrides (e.g. 1-2 hours via `User.metadata.session_timeout_seconds`) in future settings releases.
- Q: How should the system handle workspace routing when an authenticating user belongs to exactly one organization? → A: Option A (Direct Auto-Selection) with role-based permission filtering. If a user belongs to 1 organization, auto-select it. The dashboard adapts dynamically based on role permissions (Admin, Manager, Employee, Intern). The architecture includes an extensible App Route Dispatcher (`resolvePostLoginRoute`): users with access to multiple apps land on the dashboard launcher; users with permission to exactly one app (e.g. POS-only or CRM-only) can be routed directly into that application without dashboard intermediate landing.
- Q: How should Cloudflare Turnstile bot verification behave during local development and automated CI testing? → A: Option A (Official Test Mode / Dummy Pass Keys when `NODE_ENV !== "production"` using Cloudflare's always-pass test keys `1x00000000000000000000AA` / `2x00000000000000000000AB`) ensuring deterministic offline CI tests and local development.
- Q: How do invited team members interact with the 3-step onboarding pipeline? → A: Users joining via `OrganizationInvitation` bypass Step 1 (Organization) and Step 2 (Branch), joining the designated tenant/branch directly with `onboarding_status: "COMPLETED"`.
- Q: What rate limits and client UX apply to "Resend verification email"? → A: Client-side 60-second cooldown timer with live countdown; server-side rate limit of max 5 resend requests per hour per email/IP (HTTP 429).
- Q: What occurs upon password reset completion? → A: Dedicated `/auth/reset-password?token=...` card enforces password complexity, updates password hash, and immediately invalidates all active sessions in the `sessions` table across all devices.
- Q: How is the OAuth account collision challenge presented? → A: Rendered on `/auth/link-account?ticket=...` in a 400px card prompting for the existing password to verify ownership before linking the provider.
- Q: How is a newly registered user established as Admin of their specific organization without cross-tenant bleed? → A: During Onboarding Step 1, creating an `Organization` triggers an atomic transaction creating `UserOrganization`, an immutable `Role` (`organizationId: org.id`, `slug: "owner"`, `isSystem: true`) bound to all core platform permissions, and a `UserBranchRole` with `branchId: null` (granting organization-wide master authority strictly scoped to that tenant).

---

## 2. Layout, Presentation & Design System Standards

All authentication screens are styled using tokens from `DESIGN.md`.

### 2.1 Viewport Breakpoints & Reflow
* **Desktop & Large Displays (`≥ 1024px`):**
  * Outer background rendered using canvas token `background` (`#FAF3EF` light / `#1A1715` dark).
  * Form card is centered vertically and horizontally on the viewport.
  * Card envelope width is fixed at `400px` (`modal-sm` / auth standard) with `level-1` borders and subtle `level-2` elevation.
  * Company brand logo and title are centered directly above the card container using typography token `headline-md` in `brand` color (`#A43A2B` light / `#C4503F` dark).
* **Tablets (`640px – 1023px`):**
  * Centered 8-column layout grid with `16px` gutters and margins.
  * Maintains the `400px` card container width.
* **Mobile Devices (`< 640px`):**
  * Full-width single-column document sheet (`padding: 16px`) without card elevation borders.
  * Brand mark and title dock at the top in a compact header strip.
  * All interactive touch targets (inputs, checkboxes, links, provider buttons) enforce a minimum hit area of `44 × 44px` (`sizing.touch-target`).

### 2.2 Color Tokens & UI Components
* **Color Palettes:**
  * **Light Theme:** Canvas `background` (`#FAF3EF`), Card `surface` (`#FFFFFF`), Structural lines `border` (`#E9E2DE`), Control outlines `border-strong` (`#8C7E78`), Primary CTA `action` (`#0F766E`) with `on-action` (`#FFFFFF`).
  * **Dark Theme:** Canvas `background` (`#1A1715`), Card `surface` (`#24201E`), Structural lines `border` (`#3D3633`), Control outlines `border-strong` (`#7A6D67`), Primary CTA `action` (`#2DD4BF`) with `on-action` (`#04201D`).
* **Form Controls:**
  * Inputs: Height `40px` (`sizing.control-lg`), radius `DEFAULT` (`8px`), border `border-strong` meeting the 3:1 non-text contrast standard.
  * Focus State: `2px` visible outline using `focus-ring` (`#0D9488` light / `#5EEAD4` dark) with `2px` offset on all keyboard focus elements.
  * Error State: Input border shifts to `danger` (`#B91C1C` light / `#F87171` dark); accompanied by an alert icon and error message beneath the field with `aria-invalid="true"`.
* **Button Hierarchy:**
  * Primary Action: Sized at `40px` (`control-lg`), background `action`, text `on-action`. Exactly one primary button per active view.
  * Secondary / Social OAuth Buttons: Background `surface`, border `border-strong`, text `text`.

---

## 3. Theme Synchronization & Lifecycle

The application supports three theme modes: `system`, `light`, and `dark`.

### 3.1 Theme Resolution Flow
1. **Authenticated Session:** Read stored account preference from user profile (`DB / User Claim`), apply (`light`, `dark`, or `system`), and sync to document root (`data-theme`) and local storage.
2. **Unauthenticated / Guest Session:** Inspect client OS setting via `matchMedia('(prefers-color-scheme: dark)')` (with local fallback) and apply the matching theme immediately via a zero-flash `<head>` script.

### 3.2 Unauthenticated & Sign-Up Flow
* **AC-THM-01 (System-Level Detection):** Guests visiting `/signup`, `/login`, or `/forgot-password` inherit the operating system's color scheme via CSS media query `prefers-color-scheme` (`colors` vs. `colors-dark`).
* **AC-THM-02 (Zero-Flash Paint):** The theme script executes in the document `<head>` prior to DOM rendering to avoid flash-of-unstyled-theme (FOUT).

### 3.3 Authenticated User & Cross-Browser Persistence
* **AC-THM-03 (Account-Level Binding):** The user's theme selection (`system`, `light`, or `dark`) is stored as a persistent attribute on their user profile record in the database.
* **AC-THM-04 (Cross-Device & Cross-Browser Sync):**
  * When a user logs in from any new browser, desktop client, or mobile app:
    1. The authentication response delivers their stored `theme_preference`.
    2. The client updates the document root attribute (e.g., `data-theme="light"` or `data-theme="dark"`) and caches it locally.
    3. The application overrides the local host's default theme to match their saved setting.
* **AC-THM-05 (Real-Time Mutation):** Updating the theme in Workspace Settings updates DOM custom properties instantly and issues a background `PATCH /api/v1/user/preferences` request.

---

## 4. Supported Authentication Gateways & Platform Logic

### 4.1 Authentication Options
1. **Email & Password:**
   - Real-time password complexity checking: minimum 8 characters, 1 uppercase, 1 number, 1 special symbol.
   - Interactive password Show/Hide visibility toggle.
   - Semantic `autocomplete` properties: `email`, `current-password`, and `new-password`.
2. **Third-Party Consumer OAuth & Extensible Provider Registry:**
   - Active default launch providers: **Google**, **Microsoft**, and **GitHub**.
   - Displayed as full-width secondary button controls styled using token `surface` with `border-strong` outlines and official SVG iconography.
   - **Architectural Extensibility (Open-Closed Principle):** Powered by an abstract `OAuthProviderRegistry` interface. Adding future federated providers (such as Apple or GitLab) requires only adding a typed provider descriptor (`id`, `name`, `icon`, `scopes`, `handler`) to the registry without modifying core auth card layout, middleware gating, or session generation logic.
3. **Enterprise Single Sign-On (SSO) & Home Realm Discovery (HRD):**
   - As an email ending with a managed domain is typed (e.g., `user@enterprise.com`), HRD automatically replaces the password field with a `"Sign in with Enterprise SSO"` action.
   - Domain routing facilitates SAML 2.0 or OIDC authentication to Google Workspace or Microsoft Entra ID / 365 tenants.
4. **FIDO2 / WebAuthn Passkeys (Quick Login):**
   - Form email input supports `autocomplete="username webauthn"`.
   - On compatible browsers/devices, a `"Sign in with Passkey"` option triggers biometric or hardware-key authentication (`navigator.credentials.get()`).
   - Post-authentication enrollment prompts users in settings to register passkeys on their device.
5. **Session Duration & Configurable Expiration Policy:**
   - **Persistent Sessions ("Keep me signed in" checked):** 30-day session token (`maxAge: 2592000` seconds / 30 days).
   - **Ephemeral Sessions ("Keep me signed in" unchecked):** 24-hour default rolling session token (`maxAge: 86400` seconds / 1 day).
   - **System & User Configurability:** Default session durations are system-governed via environment variables (`SESSION_EPHEMERAL_MAX_AGE_SECONDS` and `SESSION_PERSISTENT_MAX_AGE_SECONDS`). The session engine architecture is structured to support future user/workspace custom session expiration settings (e.g., custom 1-hour or 2-hour high-security timeouts via `User.metadata.session_timeout_seconds`) without requiring core engine changes.
6. **Password Recovery & Global Session Invalidation:**
   - Accessible via `"Forgot password?"` on the login card.
   - Submissions dispatch a single-use token expiring in 15 minutes, returning an opaque message to prevent account enumeration.
   - **Password Reset Completion (`/auth/reset-password?token=...`):** Rendered in a centered `400px` (`modal-sm`) card with fields for "New Password" and "Confirm Password" enforcing the 8+ character complexity rules and show/hide visibility toggles.
   - **Security Invalidation Mandate:** Upon successful password reset, the server **immediately revokes and deletes all active records in the `sessions` table** for that `userId` across all browsers and devices, writes an audit log, and issues a fresh session cookie for the current client.

### 4.2 Platform Handshakes & Storage
* **Web:** Session tokens stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
* **Native Desktop (macOS/Windows/Linux):** Refresh tokens stored in OS-native secure keychains (macOS Keychain, Windows Credential Manager, Linux Secret Service API). OAuth uses the default external browser with loopback redirects (`http://127.0.0.1:{port}`) or custom protocol schemes (`businessos://auth/callback`).
* **Native Mobile (iOS/Android):** Stored in iOS Keychain or Android EncryptedSharedPreferences. OAuth executes via `ASWebAuthenticationSession` or Android Custom Tabs targeting registered Universal/App Links.
* **Offline Handling:** Native desktop/mobile launches without internet display an offline screen using token `background` surfaces with an explicit `"Retry connection"` CTA.

---

## 5. Tenancy, Account Linking & Security Safeguards

### 5.1 Multi-Tenancy, Workspace Disambiguation & Role-Based Permissions
* **Multi-Workspace Users:** When an authenticated user belongs to multiple organizations, routing halts at `/auth/choose-tenant`. Displays a card listing workspace names, slugs, user roles, and avatars. Selecting a tenant issues a tenant-scoped session context and proceeds to routing.
* **Single-Workspace Users (Direct Auto-Selection):** If a user belongs to exactly one organization, the system automatically sets that tenant's active context and proceeds immediately without prompting the chooser screen.
* **Permission-Driven Dynamic Dashboard:** The dashboard view adapts dynamically according to the user's role and assigned permissions (e.g., Owner/Admin, Manager, Employee, Intern). Only modular applications, navigation links, and administrative controls granted to that role are rendered.
* **Extensible App Route Dispatcher (`resolvePostLoginRoute`):**
  - Implements an extensible post-login route resolution strategy.
  - **Multi-App Users & Admins:** Land on `/dashboard` (Executive App Launcher).
  - **Single-App Users (Extensible Direct Handoff):** When a user's permissions grant access to exactly one modular app (e.g., POS-only frontline staff or CRM-only representative), the dispatcher routes them directly to that application's root route (e.g., `/pos`) bypassing the intermediate dashboard.

#### Tenant-Owner Bootstrapping & Permission Isolation Law
* **Automatic Master Admin Provisioning:** When a user completes Onboarding Step 1 (`POST /api/v1/onboarding/step-1`), the database executes an atomic transaction that guarantees the user has full master administrative control over their new organization and zero influence over other tenants:
  1. Creates the `Organization` record (`id: org_id`).
  2. Creates `UserOrganization` linking the user with `status: ACTIVE`.
  3. Provisions an immutable system `Role` scoped strictly to that tenant (`organizationId: org_id`, `slug: "owner"`, `name: "Organization Owner"`, `isSystem: true`).
  4. Binds all platform and app permissions (`apps:install`, `settings:manage`, `users:invite`, `billing:manage`, `roles:manage`) in `role_permissions`.
  5. Inserts `UserBranchRole` assigning the Owner role with **`branchId: null`**, establishing organization-wide master administrative authority across all current and future branches.
* **Tenant Isolation Guarantee:** All session payloads, route handlers, and database queries strictly constrain access using `where: { organizationId: session.activeOrganizationId }`. An Owner of Organization A cannot access, query, or mutate any data belonging to Organization B.
* **Delegated Employee Permissions:** When the Owner invites additional team members, they select from predefined or custom roles (`Manager`, `Cashier`, `Intern`) and assign specific branches (`branchId`). Invited members only inherit the narrow permissions explicitly mapped to their assigned role.

### 5.2 Account Linking & Collision Defense (`/auth/link-account`)
* **Collision Detection:** If a user initiates third-party OAuth (Google, Microsoft, GitHub) using an email address that already belongs to an existing credential account in `accounts`, automatic silent merging is strictly prohibited to prevent account takeover.
* **Challenge Gate (`/auth/link-account?ticket=...`):** The OAuth callback intercepts the collision, issues a short-lived cryptographically signed ticket (valid 5 minutes), and redirects the browser to `/auth/link-account`.
* **Presentation & Verification:** Rendered in a centered `400px` (`modal-sm`) card displaying: *"An account with this email already exists. Enter your existing password to link your [Provider] account."*
* **Resolution:** Successful password verification creates the federated provider record in `Account`, writes an audit log, issues a session cookie, and dispatches the user through `resolvePostLoginRoute`.

### 5.3 Bot Defense & Legal Terms
* **Bot Mitigation & Environment Modes:** Cloudflare Turnstile executes on submission of `/signup`, `/login`, and `/forgot-password`. In production, client tokens are validated against Cloudflare's `siteverify` endpoint. In non-production environments (`NODE_ENV !== "production"` or Vitest CI), the system operates in test mode utilizing Cloudflare's official dummy pass keys (`1x00000000000000000000AA` / `2x00000000000000000000AB`) to guarantee fast, deterministic, offline test suite execution.
* **Legal Acceptance:** Sign-Up includes explicit legal microcopy:  
  *"By creating an account, you agree to our Terms of Service and Privacy Policy."*

---

## 6. Routing State Machine & Session Lifecycle

### 6.1 Routing Decision Sequence
1. **Network Check:** If offline on native launch, render the Offline View with a `"Retry connection"` CTA.
2. **Unauthenticated User:** Check client version compatibility; if supported, render the Login / Signup Card.
3. **Authenticated User (`onboarding_status !== "COMPLETED"`):** Redirect to `/onboarding/step-N` (last saved incomplete step).
4. **Authenticated User (`onboarding_status === "COMPLETED"`):**
   - If belonging to multiple workspaces and active tenant is unset: route to `/auth/choose-tenant`.
   - If belonging to a single workspace (or active tenant is selected): execute `resolvePostLoginRoute(userRole, userPermissions)`.
     - Multi-app users & Admins/Managers: route to `/dashboard` (rendering role-filtered view).
     - Single-app users: route directly to designated application root (e.g., `/pos`).

### 6.2 Route Guard Rules

#### Rule 1: Authenticated User Exclusion (Guest Guard)
* **Trigger:** An authenticated user with an active session attempts to access `/login`, `/signup`, or `/forgot-password`.
* **Enforcement:** Direct access is denied.
  * If `onboarding_status === "COMPLETED"`: Redirect directly to `/dashboard`.
  * If `onboarding_status !== "COMPLETED"`: Redirect directly to `/onboarding/step-N` (last incomplete step).
* **Session Termination:** Users can only re-access unauthenticated entry points after an explicit logout (`POST /api/v1/auth/logout`) clears session cookies or keychain tokens.

#### Rule 2: First-Time User Routing (Onboarding Gate)
* **Trigger:** Account creation completes via Registration, OAuth, or SSO.
* **Enforcement:**
  * User is initialized with `onboarding_status: "IN_PROGRESS"` and `current_onboarding_step: 1`.
  * Client transitions to `/onboarding/step-1` via `history.replaceState`.
  * Browser and system back-navigation cannot re-enter the sign-up or sign-in screens.

#### Rule 3: Returning User Routing
* **Trigger:** Existing user logs in.
* **Enforcement:**
  * If `onboarding_status === "COMPLETED"`: Redirect to `/dashboard` (displaying installed apps).
  * If `onboarding_status === "IN_PROGRESS"`: Redirect to `/onboarding/step-${last_saved_step}`.

#### Rule 4: Onboarding Guard (Dashboard Protection)
* **Trigger:** An authenticated user with `onboarding_status !== "COMPLETED"` attempts to navigate to `/dashboard` or internal feature URLs.
* **Enforcement:** Navigation is intercepted and returned to `/onboarding/step-${current_step}`.

### 6.3 Platform Onboarding Pipeline Specification (3 Steps)

#### Step 1: Workspace & Organization Setup (`/onboarding/step-1`)
* **Purpose:** Provisions the enterprise tenant record (`Organization`), validates the unique workspace domain, captures industry domains, and atomically bootstraps the user as Organization Owner (`UserOrganization`, `branchId: null`). The primary operating location (`Branch`) is auto-provisioned in the background ("Main Location", "MAIN") per the Minimalist Input Law so users do not fill repetitive location fields upfront.
* **Presentation:** Rendered in a centered `480px` (`modal-sm/md`) card with stepper header: `01 Organization Details` (Active) → `02 Application Selection` → `03 Workspace Setup`.
* **Input Fields:**
  1. `organizationName` (Input `text`, Height `40px`, required): Display name of the enterprise (e.g., "Apex Hospitality Group"). Minimum 2 characters, maximum 100 characters.
  2. `organizationSlug` (Input `text` with prefix `https://` and suffix `.businessos.app`, Height `40px`, required): Workspace subdomain and URL slug (e.g., "apex-hospitality"). Auto-derived in real-time from `organizationName` with debounce uniqueness check against PostgreSQL (`/api/v1/onboarding/check-slug`). User editable. Displays green `Available` verification badge.
  3. `industries` (Interactive Multi-Select Pills & Search, required, min 1 selection): Interactive domain selection with removable tags (`[Hospitality ×]`, `[Retail ×]`) and clickable available domains (`Hospitality`, `Retail & E-commerce`, `Restaurant & F&B`, `Sales & Marketing`, `Finance & Accounting`, `Human Resources`, `Real Estate & Properties`, `Healthcare`, `Technology & Services`, `Manufacturing`).
* **Validation & Actions:**
  * Submitting triggers client-side Zod validation and sends `POST /api/v1/onboarding/step-1`.
  * Server creates `Organization` in `@suite/db` (persisting `industries` in `metadata`), auto-creates root `Branch` linked to tenant (`name: "Main Location"`, `code: "MAIN"`), links user in `UserOrganization` (`role: "Owner"`), provisions system `Role` (`slug: "owner"`, `isSystem: true`), creates `UserBranchRole` with `branchId: null`, updates `User.metadata.current_onboarding_step = 2`.
  * Client transitions via `history.pushState` to `/onboarding/step-2`.

#### Step 2: Tailored Application Selection (`/onboarding/step-2`)
* **Purpose:** Allows user to select modular business applications from available apps, dynamically recommending industry-specific applications on top based on Step 1 industry selections.
* **Presentation:** Centered `560px` card container (`modal-md`) with stepper header: `01 Organization Details` (Done) → `02 Application Selection` (Active) → `03 Workspace Setup`.
* **Components & Fields:**
  1. `industryFilterBanner`: Displays active recommendation context: *"Filtering recommendations for: [Selected Industries]"* with a *"Change industry"* link returning to Step 1.
  2. `recommendedApps` (Multi-select interactive grid cards): Modular applications matching selected industries displayed prominently on top and pre-selected by default (e.g. `Website Builder & Headless CMS`, `Lodging Property Management (PMS)`, `Restaurant POS & KDS`).
  3. `additionalApps` (Multi-select grid cards): Secondary section listing remaining available workspace applications (e.g. `Central Inventory & Procurement`, `Finance & Accounting Ledger`, `Customer Relationship Management`).
  4. Each app card displays module icon, title, description, category tag, and checkbox.
* **Validation & Actions:**
  * Submitting sends `POST /api/v1/onboarding/step-2` saving chosen `selectedApps` in `User.metadata.selected_apps` and updating `User.metadata.current_onboarding_step = 3`.
  * Client transitions to `/onboarding/step-3`.

#### Step 3: Workspace Provisioning & Confetti Launchpad (`/onboarding/step-3`)
* **Purpose:** Displays a live animated deployment progress engine while workspace modules are licensed and configured, seamlessly transitioning upon completion to a celebratory launchpad with a 5-second auto-redirect to `/dashboard`.
* **Presentation & States:**
  * **State A (Live Provisioning Engine):**
    - Master Progress Bar: Animated progress indicator (`0%` → `100%`) with pulse: *"Configuring workspace modules... 92% completed"*.
    - Deployment Stack Items: Real-time status cards for `Workspace Database` (Ready), followed by each selected application (e.g., `Deploying templates & routes...` → `Ready`).
    - API: Concurrently dispatches `POST /api/v1/onboarding/complete` which provisions licenses in `InstalledApp` table for all selected apps, updates `User.metadata.onboarding_status = "COMPLETED"`, and clears `User.metadata.current_onboarding_step = null`.
  * **State B (Celebration & Auto-Redirect):**
    - Seamless transition on 100% completion.
    - Confetti Animation: Lightweight celebratory paper glitters / confetti burst animation around a circular success checkmark.
    - Headline: *"Your workspace is ready!"*
    - Subtitle: *"Your Business OS workspace for [Organization Name] has been prepared. Let's get to work."*
    - Summary List: `CONFIGURED APPLICATIONS` with `Live & Connected` status pills.
    - Smart CTA Button: `"Go to dashboard (5s) →"` with live decrementing timer (5 → 4 → 3 → 2 → 1). Automatically executes navigation to `/dashboard` upon timeout, or immediately on click.

#### Organization Invitation Fast-Track (Onboarding Bypass)
* **Trigger:** An employee or team member creates an account or signs in via an accepted `OrganizationInvitation` (`/invite/[token]`).
* **Enforcement:**
  * The user is automatically associated with the inviting `Organization` (`UserOrganization`) and assigned their designated `Branch` and `Role` (`UserBranchRole`).
  * The user **bypasses Step 1 and Step 2 entirely** to prevent redundant organizational records.
  * `onboarding_status` is marked `"COMPLETED"` immediately.
  * Client sets active tenant/branch cookies and routes directly via `resolvePostLoginRoute` (landing on the permitted application or permission-filtered `/dashboard`).

---

## 7. Deferred Email Verification & App Marketplace Gate

### 7.1 Verification Lifecycle & Actions
* **AC-VER-01 (Deferred Enforcement):** Email verification is **mandatory**, but does not block registration or onboarding progression.
* **AC-VER-02 (Token Dispatch & Expiry):** A verification email containing a cryptographic token is dispatched upon registration. The token expires after 24 hours. Resend requests are rate-limited to a maximum of 5 requests per hour per email/IP, returning `HTTP 429 Too Many Requests` (`{"code": "RATE_LIMIT_EXCEEDED"}`).
* **AC-VER-03 (Expired Token Handler):** Visiting an expired link routes to `/auth/verify-expired`, providing a `"Send a new verification email"` action (subject to the 60-second cooldown and rate limiter).
* **AC-VER-04 (Global Dashboard Banner & Cooldown UX):** Unverified accounts on `/dashboard` display an un-dismissible top notification banner using the `warning` surface tint with an alert icon and a `"Resend verification email"` action. Clicking resend triggers a client-side **60-second cooldown timer** (`"Resend available in 59s..."`), disabling the button to prevent spam clicks.
* **AC-VER-05 (Marketplace Installation Gate):**
  * When an unverified user clicks `"Install"` or `"Activate"` on any application in the app store, the operation is blocked.
  * A Level 3 dialog (`modal-sm`, `400px`) appears:
    * **Headline:** `headline-md` `"Email verification required"`.
    * **Body:** `body-md` `"You must verify your email address before installing new applications to your workspace."`
    * **Actions:** Primary CTA `"Resend verification email"`, Secondary button `"Cancel"`.
* **AC-VER-06 (API Boundary Enforcement):** The server endpoint `POST /api/v1/apps/:id/install` rejects unverified requests with `HTTP 403 Forbidden` (`{"code": "EMAIL_VERIFICATION_REQUIRED"}`).

---

## 8. State Matrix & Route Resolution

| Scenario | Client | User State | Requested Route / Action | Resolved System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Guest visits sign-up** | Web / App | Unauthenticated | `/signup` | Apply OS theme; render centered registration card. |
| **Guest visits sign-in** | Web / App | Unauthenticated | `/login` | Render auth card with Passkey, OAuth, and Email forms. |
| **Guest visits protected area** | Web / App | Unauthenticated | `/dashboard` or `/onboarding/*` | Intercept; redirect to `/login?redirect=${target}`. |
| **New user signs up** | All | Authenticated (`IN_PROGRESS`, Step 1) | Submit Registration | Replace history; navigate to `/onboarding/step-1`; dispatch verification email. |
| **Invited member accepts invite** | Web / App | Unauthenticated / Auth | `/invite/[token]` | Bypass Steps 1 & 2; attach tenant/branch role; set `COMPLETED`; route via `resolvePostLoginRoute`. |
| **OAuth collision** | Web / App | Unauthenticated (Account exists) | OAuth Callback | Intercept; redirect to `/auth/link-account?ticket=...` to verify existing password. |
| **Enterprise email entered** | Web / App | Unauthenticated | Types `user@corp.com` | HRD switches action to `"Sign in with Enterprise SSO"`. |
| **Multi-workspace member logs in** | All | Authenticated | Post-auth handshake | Redirect to `/auth/choose-tenant` before dashboard handoff. |
| **Single-workspace member logs in** | All | Authenticated | Post-auth handshake | Auto-select tenant; execute `resolvePostLoginRoute` (filtered dashboard or single app). |
| **New browser / device sign-in** | All | Authenticated | Post-auth handshake | Fetch account theme preference; overwrite local defaults. |
| **User drops off at step 3** | All | Authenticated (`IN_PROGRESS`, Step 3) | Re-login from new client | Resolve theme; route directly to `/onboarding/step-3`. |
| **Incomplete user accesses dashboard** | All | Authenticated (`IN_PROGRESS`, Step 2) | Navigates to `/dashboard` | Intercept; bounce back to `/onboarding/step-2`. |
| **Active user visits auth page** | All | Authenticated (`COMPLETED`) | Navigates to `/login` or `/signup` | Intercept; redirect to `/dashboard`. |
| **Unverified user clicks Install App** | All | Authenticated (`COMPLETED`, unverified) | Clicks "Install" in App Store | Block action; pop `modal-sm` requiring email verification. |
| **Verification token expired** | Web | Guest / Authenticated | Clicks 24h+ email link | Route to `/auth/verify-expired` with resend action. |
| **User completes password reset** | Web / App | Guest | Submit `/auth/reset-password` | Update hash; invalidate all active user sessions globally; issue new session cookie. |
| **Desktop OAuth execution** | Desktop | Unauthenticated | Clicks "Sign in with Google" | Launch default browser; capture token on local callback loopback. |
| **App launches offline** | Desktop / Mobile | Any | App launch | Render offline screen with `"Retry connection"` CTA. |
| **Explicit sign-out** | All | Authenticated | Invokes Logout | Purge cookies/keychain; invalidate server session; redirect to `/login`. |
