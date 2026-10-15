# Quickstart Validation Guide: Identity, Authentication & Session Routing

**Feature**: `001-auth-session-routing`  
**Document ID**: `SPEC-AUTH-001`  
**Target Environments**: Next.js Dashboard (`apps/dashboard`), Auth Engine (`packages/auth`), Vitest  
**Contract Reference**: [auth-openapi.json](./contracts/auth-openapi.json)  
**Data Model Reference**: [data-model.md](./data-model.md)

---

## 1. Prerequisites & Environment Setup

Ensure PostgreSQL database and Redis development services are running:

```bash
# Check database migration status
pnpm turbo run db:generate

# Verify local package builds
pnpm turbo run build --filter=@suite/auth --filter=@suite/ui
```

Required environment variables in `.env`:
```ini
BETTER_AUTH_SECRET="super-secret-dev-jwt-key-minimum-32-chars-long"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 2. Test Execution & Automated Verification

Run existing and new test suites validating authentication, routing, and session gating:

```bash
# Run unit and integration tests across auth and dashboard packages
pnpm vitest run packages/auth/tests/
pnpm vitest run apps/dashboard/tests/auth-gate.test.tsx
```

---

## 3. End-to-End Validation Scenarios

### Scenario 1: Unauthenticated Guest Theme Auto-Detection (Zero-Flash)
- **Goal**: Verify guests visiting `/login` or `/signup` automatically receive the correct theme corresponding to their OS setting with zero flash-of-unstyled-theme.
- **Steps**:
  1. Set operating system / browser preference to Dark Mode.
  2. Open an Incognito window and navigate to `http://localhost:3000/login`.
  3. Inspect `<html data-theme="...">` and computed canvas background color.
- **Expected Outcome**:
  - `document.documentElement.getAttribute("data-theme")` evaluates to `"dark"`.
  - Background renders `#1A1715` with card surface `#24201E` and primary action button `#2DD4BF`.
  - Zero FOUT or layout shift.

---

### Scenario 2: User Registration & Onboarding Redirection Gate
- **Goal**: Verify new user sign-up transitions directly to `/onboarding/step-1` and blocks browser back-navigation to the sign-up page.
- **Steps**:
  1. Navigate to `/signup`.
  2. Fill in Name, Work Email (`founder@newtenant.com`), and Password (meeting complexity rules: 8+ chars, 1 uppercase, 1 number, 1 symbol).
  3. Click "Create Workspace".
- **Expected Outcome**:
  - Request sends `POST /api/auth/register`.
  - User record is created in PostgreSQL with `emailVerified: false`, `onboarding_status: "IN_PROGRESS"`, and `current_onboarding_step: 1`.
  - Browser executes `history.replaceState` and lands on `/onboarding/step-1`.
  - Clicking the browser's "Back" button does not navigate back to `/signup`.

---

### Scenario 3: Enterprise Home Realm Discovery (HRD) Flow
- **Goal**: Verify corporate domain entry switches password input to Enterprise SSO action.
- **Steps**:
  1. Navigate to `/login`.
  2. Type `executive@google.com` or `operator@enterprise-corp.com` into the email field.
- **Expected Outcome**:
  - Input blur or debounce triggers `POST /api/auth/sso/discover`.
  - Password input is hidden and dynamically replaced with a primary action button labeled: `"Sign in with Enterprise SSO"`.

---

### Scenario 4: Deferred Verification & Marketplace Installation Gate
- **Goal**: Confirm unverified user can use the dashboard but is blocked from installing marketplace applications.
- **Steps**:
  1. Log in with an unverified user account (`emailVerified: false`, `onboarding_status: "COMPLETED"`).
  2. Access the dashboard `/`.
  3. Observe the top persistent banner: *"Please verify your email address to unlock application installation."*
  4. Navigate to the App Store and click `"Install"` on any app (e.g. Website Builder or Restaurant POS).
- **Expected Outcome**:
  - Frontend intercepts the action and displays a `400px` (`modal-sm`) Level 3 dialog:
    - **Headline**: `"Email verification required"`
    - **Body**: `"You must verify your email address before installing new applications to your workspace."`
    - **Actions**: `"Resend verification email"` and `"Cancel"`.
  - Background API call `POST /api/v1/apps/:id/install` responds with `HTTP 403 Forbidden` (`{"code": "EMAIL_VERIFICATION_REQUIRED"}`).

---

### Scenario 5: Multi-Tenant Disambiguation & Single-Tenant Auto-Selection
- **Goal**: Verify single-tenant users are auto-selected straight to their role-permission filtered dashboard, while multi-tenant users are halted at `/auth/choose-tenant`.
- **Steps**:
  1. Authenticate with a single-tenant user (e.g. employee with single POS access or intern with view-only).
  2. Confirm direct redirect to `/dashboard` (or single-app route via `resolvePostLoginRoute`), bypassing `/auth/choose-tenant`.
  3. Verify dashboard only displays modules permitted by their active role.
  4. Authenticate with a user assigned to two or more organizations.
- **Expected Outcome**:
  - Multi-tenant login intercepts `/dashboard` navigation and halts at `/auth/choose-tenant`.
  - The UI presents a card listing workspace names, slugs, user roles, and logos.
  - Selecting a workspace dispatches `POST /api/v1/auth/switch-tenant`, sets `activeOrganizationId` in the session cookie payload, and redirects to `/dashboard`.

---

### Scenario 6: Explicit Logout & Back-Navigation Guard
- **Goal**: Verify session termination purges authentication state and prevents back-navigation to authenticated screens.
- **Steps**:
  1. In the dashboard topbar, click `"Sign Out"`.
  2. Confirm redirect lands on `/login`.
  3. Click browser's "Back" button to return to `/dashboard`.
- **Expected Outcome**:
  - Next.js middleware detects missing `suite_session` cookie and immediately redirects back to `/login?redirect=%2Fdashboard`.
  - No protected workspace content or cached sensitive data is displayed.

---

### Scenario 7: Password Reset & Global Session Invalidation
- **Goal**: Verify password reset immediately purges all active session tokens across all other devices.
- **Steps**:
  1. Open two separate browsers (e.g. Chrome and Firefox) and sign into the same user account.
  2. In Chrome, initiate password reset via `/forgot-password`, follow the link to `/auth/reset-password?token=...`, and set a new password.
  3. In Firefox, attempt to navigate to `/dashboard` or trigger any API call.
- **Expected Outcome**:
  - Chrome establishes a new active session cookie.
  - Firefox is immediately ejected and redirected to `/login?redirect=%2Fdashboard` because its session token was revoked from PostgreSQL.

---

### Scenario 8: Organization Invitation Fast-Track Bypass
- **Goal**: Verify invited team members bypass organization and branch creation steps.
- **Steps**:
  1. Admin invites employee (`cashier@company.com`) with POS role.
  2. Employee clicks invitation link `/invite/[token]`.
  3. Employee signs up / sets password.
- **Expected Outcome**:
  - Bypasses `/onboarding/step-1` and `/onboarding/step-2`.
  - User record links directly to existing `Organization` and `Branch`.
  - `onboarding_status` is marked `"COMPLETED"` immediately.
  - User is dispatched directly to their permitted app (`/pos`) or filtered dashboard.

---

### Scenario 9: Platform Super Admin Isolation & Tenant User Rejection
- **Goal**: Verify `/super-admin/*` routes strictly demand the global super admin role with MFA, and reject tenant owners/users with HTTP 403.
- **Steps**:
  1. As an unauthenticated guest, navigate to `/super-admin`.
  2. Confirm automatic redirect to `/super-admin/login?redirect=%2Fsuper-admin`.
  3. Sign in using regular tenant account credentials (even an Organization Owner).
  4. Observe Edge middleware response.
  5. Sign in using platform super admin credentials (`Role.organizationId === null`, `Role.slug === "platform-super-admin"`) and supply valid 6-digit TOTP code.
- **Expected Outcome**:
  - Tenant user is blocked with `HTTP 403 Forbidden` (`{"code": "SUPER_ADMIN_REQUIRED"}`) and redirected away from `/super-admin`.
  - Super admin with valid MFA successfully authenticates, receives super-admin session cookie, and enters the global platform console at `/super-admin`.
