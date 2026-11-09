# Break-glass admission

**Requirement**: FR-070 — a break-glass admission path protected by a credential held offline, documented in a runbook and exercised at least quarterly.

## Model

- The recovery surface is a **separate hostname** (`BREAK_GLASS_DOMAIN`) served by the same Platform app through Caddy.
- Caddy requires a **client certificate** on that hostname (`require_and_verify` against the break-glass CA) and overwrites `X-Break-Glass-Verified: 1` before proxying to the app. The private key is held offline, never in the repository, never in the app, never in the deployment secret store.
- The canonical operator hostname **strips** that header, so a normal-domain visitor cannot forge admission.
- The app's `/break-glass` page checks only the proxy header. It never asks for the private key. A missing header renders a generic "Not available" page with no details (FR-068).
- The origin network policy must allow only the Caddy proxy; FR-069 forbids direct inbound traffic. A client that reaches the app directly cannot supply the header, and the reverse proxy path is the only admitted path.

## What the page does

`https://<BREAK_GLASS_DOMAIN>/break-glass` shows the certified recovery procedure:

1. Keep the client-certificate private key in sealed offline storage.
2. Run `pnpm --filter @suite/platform bootstrap-operator` on the deployment host for the first operator, or the owner re-issue procedure for an existing operator.
3. Use the single-use link printed by the command on the **canonical operator domain** and register a passkey. The link is valid once and expires within 24 hours.
4. Record the date, certificate serial and outcome in the quarterly drill log.

The break-glass hostname does not share a session with the operator domain; it is an entry point, not a second sign-in surface.

## Incident procedure

1. Retrieve the sealed key under the two-person rule; record both holders and the time.
2. Connect to `https://<BREAK_GLASS_DOMAIN>/break-glass` and confirm the browser presents the client certificate and the page shows **Break-glass access**.
3. Run the offline bootstrap command on the deployment host. Do not paste the token into a ticket, chat or URL query string; the bootstrap token belongs in the URL fragment (`#bootstrap=...`), which browsers do not send to the server.
4. Sign in on the canonical operator domain, enrol a passkey, revoke the break-glass session if one was created, and return the key to sealed storage.
5. Verify the audit chain and the operator audit rows (`OPERATOR_BOOTSTRAPPED`, `OPERATOR_PASSKEY_REGISTERED`). Record the certificate serial and the outcome.

## Quarterly drill

- Use the staging deployment and a drill-only client certificate; never use production for the drill.
- Confirm a request **without** a client certificate fails at TLS and never reaches the app.
- Confirm a request with a valid certificate but **without** the proxy header shows the generic denial.
- Confirm the operator host strips a forged `X-Break-Glass-Verified` header.
- Exercise the bootstrap/re-issue path, verify the audit rows and record the result. A failed drill is a P1 operational finding.

## Rotation and revocation

- The break-glass certificate is rotated annually and on any suspicion of compromise.
- Removing a certificate from the CA bundle revokes admission at the next TLS handshake; no app redeploy is needed.
- Removing a person from the edge admission policy does **not** revoke their operator session; revoke sessions separately (FR-071).

## Known gaps (carry-forwards)

- **T181**: an ACTIVE operator has no self-service re-enrolment route. A domain move or lost device currently needs the owner/break-glass procedure to issue a fresh enrolment; do not claim self-service recovery.
- **T182**: live control sessions are not RP-bound. A domain move must revoke all sessions and rotate `CONTROL_SESSION_SECRET`.
- The page is intentionally read-only and writes no audit row. The certificate authentication is recorded by the proxy; the bootstrap and passkey events are audited by the API. If a future version adds an app-level recovery action, it must write its audit row in the same transaction.
