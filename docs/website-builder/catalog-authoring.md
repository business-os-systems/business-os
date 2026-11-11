# Website Builder catalog authoring

**Document reference**: `DOC-CMS-CATALOG-001`
**Audience**: platform operators and release engineers
**Scope**: the Website Builder application catalog (sections, templates, themes) and the starter catalog seed

The catalog is database-owned application content. Sections, templates and themes are records that
platform operators create, preview, publish and target from the Platform console; they are never
hard-coded in a tenant-facing runtime. A tenant reads the published version of an active item, so a
catalog change reaches tenants without a deployment.

## 1. Where catalog items live

| Item kind | Purpose | Definition payload (contract `2026-03`) | Console destination |
| --- | --- | --- | --- |
| Section | One block preset a tenant can add from **Add section** | `{ "schemaVersion": "2026-03", "block": BlockAst }` | Applications → Website Builder → Sections |
| Template | A complete multi-page site a tenant can create from | `{ "schemaVersion": "2026-03", "pages": PageAst[] }` | Applications → Website Builder → Templates |
| Theme | A complete appearance preset copied into a site | `{ "schemaVersion": "2026-03", "tokens": ThemeTokens }` | Applications → Website Builder → Themes |

A **section type** (hero, features, pricing, form, FAQ, rich text, navbar, footer) is code-owned and
declared in `BLOCK_BLUEPRINTS`. A **section preset** is catalog data built from one of those types;
adding a preset never requires a code change or a deployment (FR-068).

Catalog items carry:

- `name`, `slug` and `category` (use-case grouping such as `marketing`, `commerce`, `content` or `navigation`).
- `industries`: the reference `industry_category` codes the item suits (FR-069). This is classification,
  not availability; availability is decided by `targeting`.
- `contractVersion`: the definition contract the item was authored against. The current contract is
  `2026-03`. The admin API validates the definition against that contract before it is stored, so an
  undeclared property is rejected rather than silently persisted.

## 2. Authoring flow

1. **Create a draft.** Choose the kind, enter name, slug, category, industries and targeting, then fill
   the definition. The item starts in `DRAFT` with `currentVersion = 0` and `draftVersion = 1`.
2. **Edit through the generated form or the JSON tab.** Both views edit the same validated structure.
   The form is generated from the section type's declared fields; the JSON tab is a direct view of the
   same record. Neither path can save a field the contract does not allow (FR-147, FR-148).
3. **Preview.** Preview issues a signed, short-lived (15-minute) reference bound to a hash of the exact
   draft. The platform renders the preview; the reference is stored as preview evidence.
4. **Publish.** Publishing a draft requires a completed preview of the definition currently on the item. Publishing
   writes an immutable `cms_catalog_item_version` row, moves `currentVersion` to it and marks the item
   `ACTIVE`. Editing an active item only changes its working draft; the published version stays intact
   until the next publish (FR-005, FR-012, FR-149).
5. **Target and roll out.** Publish can update the targeting block. Targeting decides who sees the item;
   an empty targeting block means every tenant.

Saving alone never changes what a tenant sees. The tenant Add section reader resolves the definition
from the immutable version named by `currentVersion`, and create-site resolves templates the same way.

### Targeting fields

| Field | Effect |
| --- | --- |
| `plans` | Restricts the item to the listed plans. |
| `industries` | Restricts the item to workspaces whose onboarding industries include one of these codes. |
| `orgAllowlist` | When non-empty, only these organization ids may see the item. |
| `orgDenylist` | These organization ids never see the item; deny wins over every allow rule. |
| `flagKey` | Optional feature flag; a missing or disabled flag fails closed. |

Targeting is resolved in one place (`resolveCatalogTargeting`) and fail-closed. A malformed targeting
block hides the item instead of widening access.

**Current enforcement**: the section reader evaluates allow/deny, industry and feature-flag targeting;
plan targeting and template/theme targeting are completed by the catalog rollout work. The starter
catalog ships with an empty targeting block, so it is visible to every workspace regardless of plan or
industry configuration.

## 3. Lifecycle

| State | Meaning |
| --- | --- |
| `DRAFT` | Never published. Tenants do not see it. |
| `ACTIVE` | Published and available to targeted tenants. |
| `DEPRECATED` | Kept resolvable for existing content; hidden from new selections. |
| `DISABLED` | Removed from tenant selection without deleting it. |
| `RETIRED` | Terminal. It stays resolvable for existing content and is never deleted (FR-004). |

Use the console lifecycle actions rather than deleting rows. Published version rows are immutable at the
database level.

## 4. Starter catalog seed

A fresh database has no catalog rows. The starter seed makes the first website possible without
hand-authoring anything (FR-016, SC-001).

### What it creates

- Eight published sections, one per launch block type: Hero Banner, Feature Grid, Pricing Table,
  FAQ Accordion, Rich Text Article, Navigation Header, Footer Navigation and Contact Form.
- One published template: **Business Launch Template** with Home, About and Contact pages.
- One published theme: **Warm Terracotta Theme** with a complete appearance token set.

Every item is a global (`scope = GLOBAL`, `organizationId = null`) `ACTIVE` record with a published
version `1`, an immutable version row and contract version `2026-03`. The section definitions are valid
inputs to the tenant Add section drawer, so the picker is non-empty with no reader change.

### Run it

```bash
pnpm --filter @suite/db db:seed:starter-catalog
```

The command runs with the database owner connection (`DATABASE_URL`); it is deployment tooling, not a
runtime route and not a tenant-facing operation. It wraps the whole seed in one transaction.

### Idempotency contract

- **Insert-only.** The seed creates missing items and their first published version. It never updates
  or deletes an existing row.
- **Operator edits win.** Re-running it leaves renames, category changes, lifecycle transitions and
  target changes untouched.
- **No duplicates.** Item ids and version ids are deterministic (`cmscat_starter_*`). If an operator
  already owns a global item with the same kind and slug, the seed skips that entry, reports the slug
  and leaves the operator's row alone.
- **Safe to re-run.** A second run reports zero insertions.

### Human Seeding Gate

Running any database mutation against a shared or production database requires explicit written
approval from the database owner. The starter seed is no exception, even though it is insert-only and
idempotent. Local development databases may be seeded by the engineer who owns them.

### Removing or changing seeded content

Do not delete published catalog rows. Use the console to disable or retire an item and publish a new
version of a preset when its content must change; this keeps existing sites resolvable (FR-004, FR-009).
Because the seed is insert-only, editing a seeded item's slug or choosing a different starter slug is a
new content decision, not a seed change.

## 5. Verification

The database test `packages/db/tests/starter-catalog-seed.test.ts` proves, against the running
PostgreSQL instance and inside a rolled-back transaction:

- the eight required section types, one template and one theme are present;
- every seeded item is `ACTIVE` with one published version and contract version `2026-03`;
- the tenant Add section read contract returns the sections with empty targeting;
- a second run inserts nothing and preserves operator edits;
- an operator-owned slug is skipped instead of duplicated.

Run it with:

```bash
set -a; . .env; set +a; export NODE_ENV=test
pnpm --filter @suite/db test
```
