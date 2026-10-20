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
