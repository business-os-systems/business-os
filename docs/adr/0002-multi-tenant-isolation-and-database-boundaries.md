# ADR-0002: Multi-Tenant Schema and Isolation Model

## Context and Problem Statement
Business OS serves multiple enterprise organizations, each potentially operating multiple physical or operational branches. As modular vertical applications (CMS, POS, PMS, CRM, etc.) are developed, there is a risk that modular apps mutate core platform schemas or leak cross-tenant data.

## Decision Drivers
- Multi-tenancy must be established without leaking cross-tenant data.
- Core platform models (`Organization`, `Branch`, `User`, `Role`, `Permission`) must remain stable and immutable to modular app changes (Core Domain Immutability Law).
- Modular apps must not create circular or reverse dependencies in Prisma core schemas.

## Considered Options
1. Single shared monolithic database schema where modular apps add reverse relations into core models.
2. Completely separate database instances per tenant (Database-per-tenant).
3. Logical multi-tenancy in a single database with scalar tenant IDs (`organizationId`, `branchId`), app-dedicated schema files (`packages/db/prisma/schema/<app>.prisma`), and namespaced tables (`cms_*`, `pos_*`, `pms_*`).

## Decision Outcome
Chosen Option: **Option 3**. 
- Multi-tenancy in modular apps is established strictly via scalar IDs (`organizationId String`, `branchId String?`) without declaring reverse Prisma relations in `core.prisma`.
- Core platform models in `packages/db/prisma/schema/core.prisma` are strictly **read-only** to modular applications.
- Every table belonging to a modular app MUST use its mandatory application namespace prefix (e.g. `cms_*`, `pos_*`, `pms_*`).
- Generic table names (`pages`, `orders`, `forms`) are strictly forbidden.

### Consequences
- **Positive:** Perfect architectural decoupling between platform core and modular apps; zero database merge conflicts across parallel sprint branches.
- **Negative:** Requires querying relations via explicit IDs and composite indexes rather than implicit Prisma joins.

## Amendment — 2026-11-10: bounded schema annotation exception (D-017 / D-034)

**Status:** Accepted. **Record:** Platform decision D-017 (original exception) and its ratification D-034 in `05-modular-apps/platform/DECISIONS.md` of the architecture repository; issue #318.

**Problem:** Prisma 6.19.3 requires `@@schema` on every model and enum once `datasource.schemas` declares more than one schema. The Platform release needs the `platform` and `reference` schemas in the same Prisma project as the existing public models so the repository keeps one client and one migration history (plan R1), which conflicts with the read-only rule above.

**Exception:** Existing models and enums in `core.prisma`, `feature-flags.prisma` and `website-builder.prisma` carry one `@@schema("public")` annotation. This is the only permitted change to those files.

**Constraints:**
- No field, relation, index, `@@map`, default, table or migration-semantics change.
- No reverse relation is introduced into a core model; tenant references remain scalar ids.
- Every new model and enum declares its own `@@schema`; `packages/db/src/schema-registry.ts` fails one that omits it.
- Any core change that is not annotation-only needs its own numbered decision and explicit owner approval.

**Backward compatibility:** The tags are Prisma project configuration only; the generated SQL and every existing table, column and index are unchanged, so the exception is reversible one tag per model if Prisma relaxes the requirement.

**Migration:** None. The annotation set shipped with the P-01 (#210) foundation and is documented by D-017 and D-034.
