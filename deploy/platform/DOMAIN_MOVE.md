# Domain move procedure

**Requirement**: FR-063/FR-064 — the operator domain and the passkey relying-party identity are deployment configuration; changing them requires no code change and no application logic redeploy.

## Preconditions

- New hostname has DNS, a TLS certificate and the edge identity-aware policy configured.
- A fresh backup exists; the break-glass certificate and offline key have been tested.
- A maintenance window is agreed. All operators are told that existing passkeys will be refused with `RP_MIGRATION_REQUIRED` and must re-enrol.
- The deployment env is the union of the root app env and `deploy/platform/.env`; the relevant values are:
  - `CONTROL_PLANE_ORIGIN=https://<new operator domain>`
  - `CONTROL_WEBAUTHN_RP_ID=<new operator domain>`
  - `CORS_ALLOWED_ORIGINS=https://<new operator domain>`
  - `NEXT_PUBLIC_API_URL=https://<new operator domain>` (baked into the Platform build)
  - `OPERATOR_DOMAIN`, `BREAK_GLASS_DOMAIN`, `ACME_EMAIL`, `BREAK_GLASS_CA_CERT_PATH` for Caddy.

## Steps

1. Lower the old DNS TTL at least one TTL period before the window.
2. Update the deployment env and deploy the API and Platform builds. The Platform build must be rebuilt when `NEXT_PUBLIC_API_URL` changes.
3. Run `deploy/platform/verify-migrations.sh`; confirm the API and Platform health endpoints on the new hostname.
4. Revoke every live control session (owner-only SQL or the operator-session API after signing in through break-glass) and rotate `CONTROL_SESSION_SECRET`. A domain move must not leave a session that outlives the old RP identity.
5. Sign in on the new domain. Old passkeys return `401 RP_MIGRATION_REQUIRED` and write `OPERATOR_SIGN_IN_FAILED` with reason `RP_IDENTITY_CHANGED`.
6. Re-enrol each operator. Until T181 ships, use the owner/break-glass re-issue procedure; after T181, use self-service re-enrolment. Confirm `OPERATOR_PASSKEY_REGISTERED` for each.
7. Verify the audit chain, tenant isolation, catalog reads and a representative admin read on the new domain.
8. Keep the old domain as a redirect (or remove DNS after the TTL). Update the edge policy and any external links.
9. Record the change, the operator re-enrolment list and the audit-chain result.

## Rollback

- Restore the previous `CONTROL_PLANE_ORIGIN`, `CONTROL_WEBAUTHN_RP_ID`, `CORS_ALLOWED_ORIGINS` and `NEXT_PUBLIC_API_URL`; rebuild the Platform app because the API URL is baked in.
- Revoke sessions again and rotate `CONTROL_SESSION_SECRET`; a rollback is another domain move, so every operator re-enrols against the restored RP identity.
- If the rollback happens after the old domain's DNS was removed, restore DNS first and wait for propagation.

## Rehearsal

- Rehearse in staging at least quarterly and before any planned move. The rehearsal uses a drill-only break-glass certificate and a staging operator.
- Record the time to restore sign-in, the number of operators re-enrolled and any audit-chain finding. A failed rehearsal blocks the production move.
- T181 (self-service re-enrolment) and T182 (RP-bound live sessions) remain carry-forwards; do not claim them as delivered.
