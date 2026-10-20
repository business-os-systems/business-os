# ADR-0005: Universal RFC 7807 Problem Details Error Envelopes

## Context and Problem Statement
Heterogeneous error response formats across REST endpoints, Next.js route handlers, and RPC procedures cause client-side parsing failures, unhandled exceptions in UI forms, and poor developer experience.

## Decision Drivers
- Strict API consistency across all HTTP routes in the monorepo (`@suite/api`, `@suite/dashboard`).
- Standardized machine-readable error codes and human-readable error titles and details.
- Compliance with IETF RFC 7807 (Problem Details for HTTP APIs).

## Considered Options
1. Custom ad-hoc error formats per endpoint (`{ error: string }`, `{ message: string }`, `{ ok: false, msg: string }`).
2. Standardized RFC 7807 JSON envelopes with `application/problem+json` Content-Type and relative URIs (`/errors/<slug>`).
3. GraphQL-style errors array payload.

## Decision Outcome
Chosen Option: **Option 2**.
- All error responses across Next.js and Hono MUST strictly adhere to RFC 7807.
- Every problem envelope MUST include `type` (relative URI format `/errors/<slug>`), `title`, `status`, `detail`, and `code`.
- Responses MUST use the `application/problem+json` Content-Type header.
- In Next.js, handlers MUST use `problemResponse()` or `zodProblemResponse()` from `@/lib/api-response` (wrapping `@suite/core`'s `createProblemEnvelope`).
- In Hono API, routes MUST throw typed `AppError` subclasses or use `c.json(envelope.body, envelope.init)`.

### Consequences
- **Positive:** Universal predictability in client error handling; automatic mapping to form fields via `invalidParams`; zero ad-hoc error shapes.
- **Negative:** Requires all newly authored routes to import and use the canonical envelope helpers.
