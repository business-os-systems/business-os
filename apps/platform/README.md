# Platform operator app

The operator control plane runs on `http://localhost:3002`.

## Local setup

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` (for example `http://localhost:4000`).
2. Ensure the API has `CONTROL_PLANE_ORIGIN=http://localhost:3002`, `CONTROL_WEBAUTHN_RP_ID=localhost`, `CONTROL_SESSION_SECRET` and `PLATFORM_DATABASE_URL`.
3. Start the API and Platform app.

## First operator

Run the offline bootstrap command from this package:

```bash
pnpm --filter @suite/platform bootstrap-operator
```

It requires `PLATFORM_DATABASE_URL`, `CONTROL_PLANE_ORIGIN`, `PLATFORM_BOOTSTRAP_OPERATOR_EMAIL` and `REDIS_URL`. It refuses if an operator already exists, except that it can reissue the one-time link while the first operator is still `INVITED` with no passkey.

Open the printed `/sign-in?bootstrap=...` link once, register a passkey, and the operator becomes `ACTIVE`.

Sign-in is passkey-only and discoverable (no email lookup). There is no password fallback.
