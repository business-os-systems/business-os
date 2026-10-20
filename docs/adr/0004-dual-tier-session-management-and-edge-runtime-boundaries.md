# ADR-0004: Dual-Tier Session Management & Edge Runtime WebCrypto Isolation

## Context and Problem Statement
Next.js Edge middleware executes in an isolated V8 sandbox that prohibits Node.js native binary addons (such as `@node-rs/argon2`, `ioredis`, or socket connections). However, user requests must be authenticated at the Edge to protect routes before entering heavy Node.js Server Component or API route environments.

## Decision Drivers
- Zero-latency Edge middleware authentication guard without cold-start penalties.
- Strict isolation between pure WebCrypto modules and Node.js-only services (Prisma, Redis, BullMQ).
- Need to prevent bundler pollution and runtime crashes in the Next.js Edge runtime.

## Considered Options
1. Calling a remote database or Redis on every incoming request in Edge middleware.
2. Self-contained signed session tokens using standard WebCrypto HMAC-SHA256, verified at Edge without network hops, with session state mutations executed in Node.js server routes.
3. Client-side unencrypted cookies with JWTs containing full database records.

## Decision Outcome
Chosen Option: **Option 2**.
- Session tokens are signed using standard WebCrypto `crypto.subtle` HMAC-SHA256.
- The Edge-facing module (`@suite/auth/session/index.ts` and `apps/dashboard/src/lib/auth-constants.ts`) is strictly pure TypeScript and WebCrypto, with ZERO dependencies on `@suite/redis`, `ioredis`, `bullmq`, or `@suite/db`.
- Redis-dependent functions (e.g. `getUserRolePermissions`, `invalidateUserPermissionsCache`) reside in dedicated Node.js-only files (`role-permissions.ts`) exported exclusively from `@suite/auth`'s root index.
- Middleware verifies token integrity in microsecond time at the Edge and forwards validated security headers down to handlers.

### Consequences
- **Positive:** Uncompromised Edge middleware performance; complete immunity from Node.js native addon runtime crashes in V8 isolates.
- **Negative:** Session token size must remain compact (< 4KB cookie limit) carrying only essential claims (`userId`, `orgId`, `branchId`, `permissions`, `secVer`).
