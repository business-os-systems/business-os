# Business OS (Composable Business Operating System)
## Venture-Backed Modular Operating System for Modern Physical & Digital Businesses
### Scalable Architecture: Hotellerie, F&B Dining, Retail & Services

[![CI](https://github.com/business-os-systems/business-os/actions/workflows/ci.yml/badge.svg)](https://github.com/business-os-systems/business-os/actions/workflows/ci.yml)
[![Turborepo](https://img.shields.io/badge/Turborepo-v2-blue.svg)](https://turbo.build/repo)
[![pnpm](https://img.shields.io/badge/pnpm-v11-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org)

---

## 🚀 How to Start the Servers

All commands are simple and work directly with either **`npm run <command>`** or **`pnpm <command>`** from the root folder.

### 1. Start the Website Builder & Admin Dashboard (Port 3001)
To start the visual website builder and admin dashboard:
```bash
npm run dev:dashboard
# or
pnpm dev:dashboard
```
👉 **Open in browser:** **[http://localhost:3001](http://localhost:3001)**

> **💡 Note:** The dashboard integrates directly with PostgreSQL database services and API endpoints. Create sites, manage pages in the Studio canvas, inspect properties, and test responsive preview sandboxes with full tenant isolation.

---

### 2. Start the Backend API Gateway (Port 4000)
To start the backend API server:
```bash
npm run dev:api
# or
pnpm dev:api
```
👉 **Interactive API Docs (OpenAPI / Scalar):** **[http://localhost:4000/reference](http://localhost:4000/reference)**

---

### 3. Start Both Dashboard and API Together
To run all applications concurrently in a single terminal:
```bash
npm run dev
# or
pnpm dev
```

---

## 📋 Simple Commands Reference

| What you want to do | npm Command | pnpm Command | URL / Port |
| :--- | :--- | :--- | :--- |
| **Start Website Builder & Dashboard** | `npm run dev:dashboard` | `pnpm dev:dashboard` | `http://localhost:3001` |
| **Start Backend API Gateway** | `npm run dev:api` | `pnpm dev:api` | `http://localhost:4000` |
| **Start All Dev Servers** | `npm run dev` | `pnpm dev` | Both 3001 & 4000 |
| **Build Dashboard for Production** | `npm run build:dashboard` | `pnpm build:dashboard` | — |
| **Build Backend API for Production** | `npm run build:api` | `pnpm build:api` | — |
| **Build Entire Monorepo** | `npm run build` | `pnpm build` | — |
| **Run Dashboard Unit & E2E Tests** | `npm run test:dashboard` | `pnpm test:dashboard` | Vitest (40 tests) |
| **Run Website Builder Module Tests** | `npm run test:website-builder` | `pnpm test:website-builder` | Vitest (36 tests) |
| **Run Backend API Tests** | `npm run test:api` | `pnpm test:api` | Vitest |
| **Run All Monorepo Tests** | `npm run test` | `pnpm test` | All packages |
| **Generate Prisma Database Client** | `npm run db:generate` | `pnpm db:generate` | — |
| **Open Prisma Database Studio** | `npm run db:studio` | `pnpm db:studio` | `http://localhost:5555` |
| **Run Monorepo Typecheck** | `npm run typecheck` | `pnpm typecheck` | TypeScript Strict |
| **Run Monorepo Linting** | `npm run lint` | `pnpm lint` | ESLint |

---

## 🖥️ Live Walkthrough: Website Builder Studio

Once you run `npm run dev:dashboard` (or `pnpm dev:dashboard`), open `http://localhost:3001` and explore:

1. **Dashboard Home:** `http://localhost:3001/`  
   High-level overview showing active sites, system metrics, and quick action buttons.

2. **Sites Explorer:** `http://localhost:3001/sites`  
   View your sites (e.g. *Riverview Bistro Flagship*, *Cafe Terrace & Wine Bar*), manage domains, and create new sites.

3. **Page Explorer:** `http://localhost:3001/sites/site_riverview_main/pages`  
   View all pages under a site (`/`, `/menu`, `/about`, `/reservations`) and click "Open Visual Studio".

4. **Visual Studio Editor:** `http://localhost:3001/sites/site_riverview_main/editor/page_home`  
   The core interactive visual builder:
   - **Visual Canvas:** Click any section or block (Hero, Features, Pricing, Testimonials, CTA) to select it with live blue selection bounds.
   - **Block Tree (Left Drawer):** Inspect section/block hierarchy and add new blocks with one click.
   - **Property Inspector (Right Panel):** Live-edit headlines, copy, badges, buttons, colors, and paddings in real time.
   - **Autosave Engine:** Debounced CAS (Compare-And-Swap) optimistic auto-save with conflict detection.

5. **Full-Screen Preview Sandbox:** `http://localhost:3001/sites/site_riverview_main/preview/page_home`  
   Preview your site in full screen and toggle between **Desktop**, **Tablet**, and **Mobile** viewports.

---

## 📁 Project Structure (What Each Part Does)

The repository is structured as a high-performance **Turborepo + pnpm** monorepo divided into **Apps**, **Modules**, and **Packages**:

```
business-os/
│
├── apps/                                  # 🚀 Executable Deployable Applications
│   │
│   ├── dashboard/                         # Next.js 15 Admin Portal & Visual Studio (Port 3001)
│   │                                      # • Run command: npm run dev:dashboard
│   │                                      # • Shell navigation, tenant switcher, and sidebar
│   │                                      # • Sites Explorer and Page Explorer
│   │                                      # • Visual Canvas Editor and Preview Sandbox
│   │
│   └── api/                               # Hono v4 REST API Gateway (Port 4000)
│                                          # • Run command: npm run dev:api
│                                          # • REST API endpoints with OpenAPI 3.1 documentation
│                                          # • Multi-tenant authentication middleware & RBAC guards
│
├── packages/modules/                      # 🧩 Modular Business Suite (Pluggable Verticals)
│   │
│   └── website-builder/                   # App 01: Headless CMS & Visual Website Builder
│       ├── src/ast/                       # • Abstract Syntax Tree schema & Zod validators
│       ├── src/editor/                    # • Canvas, Block Tree, Inspector & CAS autosave hook
│       ├── src/render/                    # • 5 Core Blocks (Hero, Features, Pricing, Testimonials, CTA)
│       ├── src/db/                        # • CMS database repository & queries
│       ├── src/services/                  # • Publishing logic, OCC versioning, domain routing
│       └── src/routes/                    # • Hono CMS API route handlers
│
├── packages/                              # 🧱 Core Platform Libraries (Shared across all apps)
│   │
│   ├── ui/                                # Central Design System (@suite/ui)
│   │                                      # • Reusable components (Buttons, Dialogs, Drawers, Badges, etc.)
│   │                                      # • Central Lucide icon facade (@suite/ui/icons)
│   │
│   ├── db/                                # Database layer with Prisma v6
│   │                                      # • Multi-tenant schemas (core.prisma, website-builder.prisma)
│   │                                      # • Prisma Client singleton & tenant isolation extensions
│   │
│   ├── auth/                              # Authentication layer (Better-Auth, session handling, PIN overrides)
│   ├── core/                              # Universal business primitives & RBAC authorization engine
│   ├── redis/                             # Redis client singleton, distributed locks, rate limiters
│   └── logger/                            # Structured Pino v9 logger with correlation IDs
│
└── tooling/                               # ⚙️ Shared Engineering Configurations
    ├── tsconfig/                          # Strict TypeScript configurations
    ├── eslint-config/                     # Monorepo linting rules
    └── tailwind-config/                   # Shared Tailwind CSS tokens & styling
```

---

## 🏛️ Clean Architecture & Monorepo Rules

1. **Unidirectional Dependency Flow:**  
   `apps` $\rightarrow$ `packages/modules` $\rightarrow$ `packages (core/ui/db)` $\rightarrow$ `tooling`.  
   Platform packages never depend on apps or modules.

2. **Zero Cross-App Imports:**  
   `apps/dashboard` and `apps/api` are isolated deployables and never import each other directly.

3. **Core Domain Immutability:**  
   Modular apps (App 01 Website Builder, App 02 POS, App 03 PMS, etc.) never modify `packages/db/prisma/schema/core.prisma` or inject reverse foreign relations into core models (`Organization`, `Branch`, `User`). Modular schemas live exclusively in their own isolated schema files (`schema/<app-name>.prisma`).

4. **Multi-Tenancy at Kernel Level:**  
   Every business entity belongs to an `organizationId` (and optional `branchId`). All database reads/writes enforce tenant isolation boundaries.

---

## 🛠️ Prerequisites & Setup

- **Node.js:** `>= 20.0.0`
- **pnpm:** `>= 9.0.0` (Install with: `npm install -g pnpm`)

### First-Time Setup:
```bash
# 1. Install dependencies
pnpm install

# 2. Start the dashboard
npm run dev:dashboard
# or: pnpm dev:dashboard
```

---

## 📜 Engineering Standards
This repository adheres to strict enterprise specifications documented in [`ENTERPRISE_ENGINEERING_STANDARDS_AND_PHILOSOPHY.md`](file:///home/rohit-bahuguna/RB/Composable_Business_Operating_System/00-master-tracker/ENTERPRISE_ENGINEERING_STANDARDS_AND_PHILOSOPHY.md).
