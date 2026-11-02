# Platform Security Risk Acceptance

## SCR-010 — Synced passkeys accepted

- **Risk:** FR-057 describes a device-bound passkey. The Platform currently accepts synced iCloud/Google passkeys (`backedUp: true`), because an operator whose only passkey is synced would otherwise be locked out and there is no add-another-passkey flow yet.
- **Owner:** Rohit Bahuguna
- **Accepted:** 2026-11-02
- **Review by:** 2026-12-31
- **Compensating controls:** resident key required, user verification required, phishing-resistant WebAuthn ceremony, control-session Origin guard, 30-minute idle / 8-hour absolute session, operator audit trail.
- **Exit criteria:** add a second-passkey/recovery flow, then enforce device-bound registration and sign-in.
- **Status:** Accepted Risk — must not be silently changed to “implemented”.

This acceptance is reflected in `specs/005-super-dashboard/spec.md` FR-057.
