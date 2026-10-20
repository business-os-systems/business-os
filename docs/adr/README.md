# Architecture Decision Records (ADRs)

This directory maintains the persistent Architecture Decision Records (ADRs) for the Universal Composable Business Operating System (**Business OS**).

Decisions follow the [Markdown Architectural Decision Records (MADR)](https://adr.github.io/madr/) format and govern foundational architectural invariants across monorepo packages, security boundaries, database schemas, and user experience standards.

## Decision Index

| ADR | Title | Status | Date |
| :--- | :--- | :--- | :--- |
| [ADR-0001](./0001-record-architecture-decisions.md) | Record Architecture Decisions | **Accepted** | 2026-10-15 |
| [ADR-0002](./0002-multi-tenant-isolation-and-database-boundaries.md) | Multi-Tenant Schema and Isolation Model | **Accepted** | 2026-10-15 |
| [ADR-0003](./0003-pure-capability-based-authorization.md) | Pure Capability-Based Authorization over Static Role Slugs | **Accepted** | 2026-10-15 |
| [ADR-0004](./0004-dual-tier-session-management-and-edge-runtime-boundaries.md) | Dual-Tier Session Management & Edge Runtime WebCrypto Isolation | **Accepted** | 2026-10-16 |
| [ADR-0005](./0005-universal-rfc-7807-problem-details.md) | Universal RFC 7807 Problem Details Error Envelopes | **Accepted** | 2026-10-16 |
| [ADR-0006](./0006-config-driven-ui-and-interface-segregation.md) | Declarative Config-Driven UI & SOLID Interface Segregation | **Accepted** | 2026-10-16 |

---

## Status Definitions
- **Proposed:** Under review by core engineering and security architects.
- **Accepted:** Approved and enforced across repository CI gates and code reviews.
- **Superseded:** Replaced by a subsequent ADR (referenced in header).
- **Deprecated:** No longer applicable.
