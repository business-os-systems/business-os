# Knip baseline

- **Issue:** #274 (CI ratchet)
- **Command:** `pnpm knip:report` (runs `knip --no-exit-code`)
- **Captured:** 2026-11-09 on branch `feat/#274-ci-ratchet`
- **CI behaviour:** report-only. The **Lint, rules & reports** job prints this
  report and never fails on it. The registries below are the triage record.
- **Owner:** Platform engineering. **Review/expiry:** 2027-03-31.

Knip is a ratchet, not a cleanup backlog: the accepted list may shrink, never
grow. A new unused file, export, or dependency is not added here to make CI
green; it is fixed. Removing an accepted item early needs an issue because some
entries are public API or framework conventions.

## Current counts

| Finding               | Count |
| --------------------- | ----- |
| Unused files          | 1     |
| Unused dependencies   | 0     |
| Unlisted dependencies | 5     |
| Unused exports        | 145   |
| Unused exported types | 88    |
| Duplicate exports     | 6     |
| Configuration hints   | 15    |

The issue text mentioned 106 exports and 71 types; the tree at `dev 0d4cd21`
reports 145 and 88. The delta is stale issue inventory, not new dead code from
this branch (the count is unchanged by the deletions below).

## Deleted in #274 (grep-verified, no remaining references)

| Item                                                                                   | Kind       | Verification                                                         |
| -------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `apps/dashboard/src/app/(dashboard)/settings/members/components/member-role-modal.tsx` | File       | Re-export shim for `member-edit-modal`; `git grep` found no importer |
| `apps/dashboard/src/components/config-renderers/index.ts`                              | File       | Barrel; all consumers import the concrete renderer files             |
| `apps/dashboard/src/components/layout/index.ts`                                        | File       | Barrel; all consumers import concrete layout modules                 |
| `apps/dashboard/src/components/settings/index.ts`                                      | File       | Barrel; all consumers import concrete settings modules               |
| `clsx` (apps/dashboard)                                                                | Dependency | No import in `apps/dashboard/src` or tests                           |
| `tailwind-merge` (apps/dashboard)                                                      | Dependency | No import in `apps/dashboard/src` or tests                           |
| `@suite/auth` (packages/modules/website-builder)                                       | Dependency | Module source imports only `@suite/{core,db,ui}`                     |
| `@suite/logger` (packages/modules/website-builder)                                     | Dependency | Same                                                                 |
| `@suite/redis` (packages/modules/website-builder)                                      | Dependency | Same                                                                 |

`pnpm install` updated `pnpm-lock.yaml` (2 packages added, 5 removed).

## Accepted: unused files (1)

| Finding                                | Why kept                                                                                                                                                                             | Owner / expiry                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `apps/api/scripts/prune-flag-audit.ts` | Invoked by `.github/workflows/prune-flag-audit.yml` through `docker compose run`; Knip does not parse workflow YAML. Deleting it would break the nightly audit-retention job (OP-6). | Platform engineering / 2027-03-31 |

## Accepted: unlisted dependencies (5)

These are real reports but adding them changes package manifests beyond the
"remove unused dependency" scope of #274. They are recorded for the next
dependency-hygiene pass.

| Finding                                                                                   | Why accepted                                                                                                                                                                                          | Owner / expiry                    |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `jsdom` in `apps/platform/tests/{app-catalog,lifecycle,operators,tenant-config}.test.tsx` | Test-environment import resolved transitively today. The fix is to add `jsdom` to `apps/platform` devDependencies; do it in a dependency-hygiene issue so the lockfile change is reviewed on its own. | Platform engineering / 2027-03-31 |
| `tailwindcss` in `packages/ui/tailwind.preset.cjs`                                        | The preset is a shared Tailwind config consumed by the Next apps, which own the `tailwindcss` dependency. Adding it to `@suite/ui` would create a second Tailwind install for a dev-only config file. | Platform engineering / 2027-03-31 |

## Accepted: unused exports (145) and exported types (88)

These are not deleted in bulk. An exported symbol is not automatically dead: it
may be the public surface of a package, an OpenAPI route object assembled by
`app.route()`, a schema used by generated documentation, or a type used only at
a boundary. A removal pass needs its own API review and tests.

| Category                                          | Representative findings                                                                              | Why kept                                                                                                                                                                     | Owner / expiry                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Route definitions exported for registration/tests | `listTenantsRoute`, `getBranchRoute`, `switchBranchRoute`, `getReadinessRoute`                       | `createRoute()` objects are composed into Hono apps and asserted by route tests; Knip sees the named export as unreferenced when the app imports the router, not each route. | Platform engineering / 2027-03-31 |
| Package public API and constants                  | `PLATFORM_ENV_KEYS`, `HEALTH_STATES`, `QUEUE_KINDS`, `TENANT_ACCESS_CACHE_PREFIX`                    | Canonical registries consumed across packages or intended as the supported surface; deleting narrows the package API.                                                        | Platform engineering / 2027-03-31 |
| Zod schemas and inferred types                    | `flagKeySchema`, `flagRuleInputSchema`, `installedAppSchema`, `tenantRecordSchema`                   | Contract schemas exposed for reuse and tests even when a route imports only the inferred type.                                                                               | Platform engineering / 2027-03-31 |
| Component prop/context interfaces                 | `AuthCardHeaderProps`, `AuthFormStateProps`, `RouteAuthorizationContext`, `DashboardInstalledAppNav` | Type-only exports that document a component/service contract. Knip reports the type, not a runtime cost.                                                                     | Platform engineering / 2027-03-31 |
| Test helpers                                      | `PLATFORM_SCHEMA_TABLES`, `buildFlagExpiry`, `resetPlatformSchema`                                   | Used by integration suites behind conditional setup; report-only because a helper is reused by future suites.                                                                | Platform engineering / 2027-03-31 |
| Framework conventions                             | `isDevelopment`, `isTest`, `isServer`, `getCurrentSession`                                           | Small guards behind `NODE_ENV`/server checks, kept as the documented entry point even when one caller remains.                                                               | Platform engineering / 2027-03-31 |

## Accepted: duplicate exports (6)

| Alias pair                                                                           | Why kept                                                                              | Owner / expiry                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------- |
| `baseNavigationConfig` / `masterNavigationConfig`                                    | Compatibility alias used by existing imports; removing it is an API rename.           | Platform engineering / 2027-03-31 |
| `MILLISECONDS_PER_MINUTE` / `SYSTEM_REFRESH_INTERVAL_MS`                             | Two names for the same unit constant; the semantic alias is used at call sites.       | Platform engineering / 2027-03-31 |
| `DEFAULT_SESSION_COOKIE_NAME` / `SESSION_COOKIE_NAME`                                | Deprecated alias retained for auth consumers.                                         | Platform engineering / 2027-03-31 |
| `XIcon` / `CloseIcon`, `PasskeyIcon` / `FingerprintIcon`, `StoreIcon` / `BranchIcon` | Icon aliases with domain-specific names; both names appear in navigation/config code. | Platform engineering / 2027-03-31 |

## Accepted: configuration hints (15)

Knip suggests removing every `ignore` and `ignoreDependencies` entry. They are
kept deliberately: build outputs and generated files must not be scanned
(`dist`, `.next`, `coverage`, `graphify-out`, `.agents`, `.local`, `*.d.ts`,
migrations), and the ignored dev dependencies are invoked from scripts or config
(`@changesets/cli`, `husky`, `lint-staged`, `dependency-cruiser`, `jscpd`,
`eslint-import-resolver-typescript`, `prettier`). Removing the hints would
produce false positives, not fewer findings. Owner: Platform engineering /
2027-03-31.

## Re-running

```bash
pnpm knip:report                     # full report, never fails CI
pnpm knip:report | sed -n '1,20p'    # summary counts
```

When an accepted finding is fixed, remove its row here in the same change and
lower the count. Do not add a row for new code.
