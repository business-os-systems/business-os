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
├── .changeset/                   # Semantic versioning and changelog generator
├── .github/                      # CI/CD GitHub Actions workflows
├── .husky/                       # Pre-commit git hooks (lint-staged, boundary check)
├── .npmrc                        # Strict pnpm configuration
├── package.json                  # Root monorepo workspace package.json
├── pnpm-lock.yaml                # Deterministic lockfile
├── pnpm-workspace.yaml           # Workspace declaration
├── turbo.json                    # Turborepo task pipeline and caching rules
│
├── apps/                         # Executable Deployable Applications
│   ├── api/                      # Hono v4 REST + RPC API Gateway (Node.js 22)
│   ├── dashboard/                # Next.js 16 App Router Multi-Tenant Admin Portal
│   ├── web/                      # Next.js 16 Public Guest Storefront & Engine
│   ├── worker-audit/             # Standalone BullMQ Worker (Hash chaining & Archival)
│   ├── desktop/                  # Tauri v2 POS Offline Desktop Shell (Rust + Web)
│   ├── mobile/                   # Capacitor v8 Android/iOS Staff App
│   └── ai-service/               # Python 3.12 FastAPI + LangGraph Sidecar
│
├── packages/                     # Core Platform Libraries & Shared Primitives
│   ├── db/                       # Prisma v6 client, Schema folders & Tenant extensions
│   ├── auth/                     # Better-Auth instantiation, Session MW, Passkeys, SSO
│   ├── core/                     # RBAC evaluator, Operational clock turnover, Zod schemas
│   ├── audit-sdk/                # BullMQ audit producer, SHA-256 cryptographic chaining
│   ├── media/                    # Cloudflare R2 S3 client, presigned URL helpers
│   ├── redis/                    # ioredis client singleton, distributed locks, rate limiters
│   ├── logger/                   # Pino v9 structured logger with correlation IDs
│   └── ui/                       # Shared shadcn/ui components & Tailwind v4 variables
│
├── packages/modules/             # Modular Business Suite Apps (Pluggable Verticals)
│   ├── sites-cms/                # App 1: Headless CMS & Visual Website Builder
│   ├── booking-engine/           # App 2: Public Booking Engine & Guest Portal
│   ├── lodging-pms/              # App 3: Lodging PMS & Front Desk
│   ├── restaurant-pos/           # App 4: Restaurant POS & Kitchen Display (KDS)
│   ├── inventory/                # App 5: Central Stock & Material Requisitions
│   └── ...                       # Subsequent modular apps (6 to 12)
│
└── tooling/                      # Shared Developer Tooling & Configurations
    ├── tsconfig/                 # Shared tsconfig bases (base, nextjs, react, node)
    ├── eslint-config/            # ESLint flat config + import boundary rules
    ├── tailwind-config/          # Tailwind CSS v4 shared styling tokens
    └── prettier-config/          # Shared formatting rules
```

---

## 3. Strict Boundary Rules

To preserve enterprise maintainability and prevent technical debt:
1. **Unidirectional Flow:** Applications (`apps/*`) depend on business modules (`packages/modules/*`) and shared platform packages (`packages/*`). Platform packages never import applications.
2. **Zero Cross-App Imports:** Deployable apps (`apps/*`) never import other apps directly.
3. **Zero Cross-Module Direct Imports:** Pluggable modules (`packages/modules/*`) never import each other directly; cross-module events pass asynchronously via BullMQ or platform contracts.
4. **Encapsulated Database Access:** Database access is strictly encapsulated in `@suite/db`; `@suite/core` contains pure domain logic with zero direct database dependencies.
5. **Tenant Isolation:** All database operations enforce tenant isolation hooks (`organizationId` / `branchId`).
6. **Zero Untyped Code:** All schemas are strictly validated with Zod and TypeScript `strict: true` (zero `@ts-ignore` and zero `any`).

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
