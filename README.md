# Business OS (Composable Business Operating System)
## Venture-Backed Modular Operating System for Modern Physical & Digital Businesses
### Scalable Architecture: Hotellerie, F&B Dining, Retail & Services

[![CI](https://github.com/business-os-systems/business-os/actions/workflows/ci.yml/badge.svg)](https://github.com/business-os-systems/business-os/actions/workflows/ci.yml)
[![Turborepo](https://img.shields.io/badge/Turborepo-v2-blue.svg)](https://turbo.build/repo)
[![pnpm](https://img.shields.io/badge/pnpm-v11-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org)

---

## 1. Architecture Overview

Business OS is a composable, multi-tenant enterprise operating system built to power hotels, homestays, restaurants, retail shops, and service businesses through a unified, modular app architecture.

Instead of running disconnected legacy systems (e.g., separate PMS, POS, CMS, and accounting software), Business OS consolidates all operations around **4 Universal Primitives**:
1. **Ledger (Finance & Transactions):** Double-entry accounting, real-time folios, and GST tax auditing.
2. **Material (Inventory & Stock):** Unit-conversion inventory tracking, wastage logging, and procurement.
3. **People (IAM & Staff Management):** Centralized identity, multi-branch switching, biometric Passkeys, and shift PINs.
4. **Asset (Physical Units):** Rooms, restaurant tables, parking lots, and rental equipment.

---

## 2. Monorepo Topology

This repository is organized as a high-performance **Turborepo v2 + pnpm** workspace:

```
business-os/
│
├── apps/
│   ├── api/                     # High-throughput Core API Gateway (Hono v4 + Node.js)
│   ├── web/                     # Unified Multi-Tenant Storefront (Next.js 15 App Router)
│   ├── dashboard/               # Tenant Admin & Back-Office ERP (Next.js 15 + Tailwind)
│   └── pos-desktop/             # Offline-Resilient Physical POS (Tauri v2 + Rust)
│
├── packages/
│   ├── core/
│   │   ├── db/                  # PostgreSQL 16 + Prisma v6 schema & tenant $extends
│   │   ├── auth/                # Better-Auth v1.1+, SSO & manager override PIN
│   │   ├── core/                # 4 AM turnover clock, RBAC engine & RFC 7807 errors
│   │   ├── redis/               # ioredis connection pool & Redlock distributed mutex
│   │   └── logger/              # Pino v9 structured logger with trace correlation
│   │
│   ├── modules/
│   │   ├── sites-cms/           # App 1: Website Builder & Headless CMS
│   │   ├── booking-engine/      # App 2: Public Booking Engine & Guest Portal
│   │   ├── lodging-pms/         # App 3: Lodging PMS & Front Desk Operations
│   │   └── restaurant-pos/      # App 4: Restaurant POS & Kitchen Display (KDS)
│   │
│   └── tooling/
│       ├── tsconfig/            # Shared strict TypeScript compiler configurations
│       └── eslint-config/       # Architecture boundary rules and linter guards
```

---

## 3. Strict Boundary Rules

To preserve enterprise maintainability and prevent technical debt:
1. **Unidirectional Flow:** Applications (`apps/*`) depend on business modules (`packages/modules/*`), which depend on core infrastructure (`packages/core/*`).
2. **Zero Cross-Module Direct Imports:** Modules never import each other directly; cross-module events pass via BullMQ or platform contracts.
3. **Tenant Isolation:** All database access is mediated through `@suite/db` with automatic tenant isolation hooks.
4. **Zero Untyped Code:** All schemas are strictly typed with Zod and TypeScript `strict: true`.

---

## 4. Getting Started

### Prerequisites:
- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 9.0.0`
- **PostgreSQL:** `16+`
- **Redis:** `7+`

### Setup:
```bash
# Clone the repository
git clone git@github.com:business-os-systems/business-os.git
cd business-os

# Install workspace dependencies
pnpm install

# Run type checking across the entire monorepo
pnpm typecheck

# Run linting across all packages
pnpm lint
```

---

## 5. Engineering Standards & Quality Bar

This codebase is governed by our permanent **[Enterprise Engineering Standards and Philosophy](file:///home/rohit-bahuguna/RB/Composable_Business_Operating_System/00-master-tracker/ENTERPRISE_ENGINEERING_STANDARDS_AND_PHILOSOPHY.md)**.
