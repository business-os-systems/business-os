# Duplication triage (jscpd)

- **Issue:** #274 (CI ratchet)
- **Command:** `pnpm dup:report` (`jscpd --config .jscpd.json || true`)
- **Captured:** 2026-11-09 on branch `feat/#274-ci-ratchet`
- **CI behaviour:** report-only. The **Lint, rules & reports** job runs
  `pnpm dup:report` on every push and pull request; the script ends in
  `|| true`, so a clone is reported but never fails the build.
- **Owner:** Platform engineering. **Review/expiry:** 2027-03-31.

## Result

| Metric               | Value                     |
| -------------------- | ------------------------- |
| Files analysed       | 542                       |
| Clones found         | 89                        |
| Duplicated lines     | 1,905 (2.52%)             |
| Duplicated tokens    | 8,957 (2.49%)             |
| Threshold / min size | 5% / 10 lines / 70 tokens |

The configured threshold is 5%, so the current 2.52% would pass even if the
command were gating. The report is kept report-only so a new clone is visible
before it is large enough to breach the threshold.

## Decision rule

Extract one small shared helper only when **all** of the following hold:

1. the same _rule_, not merely similar code, appears at least three times;
2. the extraction is small and local (no cross-app orchestration change);
3. behaviour is unchanged and the existing tests still cover it.

Otherwise leave the code alone and record the cluster here. Issue #274 also has
a hard scope rule: do not refactor application code; only Knip-proven dead files
and dependencies may be deleted. That rule is why no extraction was performed on
this branch.

## Clusters and decisions

| Cluster                                                                                                                                                | Copies (jscpd pairs)                                 | Decision                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/Dockerfile` vs `apps/dashboard/Dockerfile` (2 blocks)                                                                                        | 2                                                    | Leave. Deployment images differ by app; a shared base image is an infrastructure change, not a helper extraction.                                                                       |
| API route scaffolding: auth guard, Zod parse, problem response (`apps/dashboard/src/app/api/v1/settings/**`)                                           | ~45 pairs across addresses, branches, members, roles | Leave for a dedicated ticket. The same pattern repeats 3+ times, but extracting a route wrapper touches dozens of handlers and their denial tests; not small or local.                  |
| Auth route handlers (`forgot-password`, `login`, `passkey/verify`, `reset-password`, `link-account`)                                                   | ~8 pairs                                             | Leave. Session/cookie/response mapping varies per flow (WebAuthn, password, invitation); a shared abstraction needs its own security review.                                            |
| Member/role/address/branch service projections and validation                                                                                          | ~20 pairs                                            | Leave. These are 2–3 copy pairs over different DTOs; extracting would create a bag-of-options helper, which the interface rules forbid.                                                 |
| Table toolbars: branch, member, role                                                                                                                   | 3 similar toolbars (14–26 lines each)                | Closest 3+ candidate, but it is UI application code and the visual contract (toolbar layout, labels, actions) differs. Deferred to a UI-consolidation ticket; see #274 hard scope rule. |
| `packages/ui/src/icons/index.tsx`                                                                                                                      | 6 clone pairs; 100+ icons share one `<svg>` wrapper  | Leave. The wrapper repeats 3+ times, but a mechanical 100-icon refactor is a large diff and risks changing rendered output; extraction helper would be small but the change is not.     |
| `apps/dashboard/src/components/settings/sticky-action-bar.tsx` vs `packages/ui/src/components/sticky-action-bar.tsx`                                   | 2 (81 and 47 lines)                                  | Leave. Two copies, not three. The app copy may be removable once a consumer audit proves no local divergence; not proven here.                                                          |
| `packages/core/src/constants/app-manifests.ts` vs `packages/modules/website-builder/src/manifest.ts`                                                   | 2 (31 lines)                                         | Leave. Two copies; the correct fix is for the module to import the core manifest, an ownership decision for a module ticket.                                                            |
| `packages/auth/src/session/branch-context.ts` self-clone                                                                                               | 2 blocks                                             | Leave. Two occurrences.                                                                                                                                                                 |
| `packages/modules/website-builder/src/services/page-service.ts` self-clone                                                                             | 2 blocks                                             | Leave. Two occurrences inside one service; extracting a private helper is reasonable only with that module's tests.                                                                     |
| `packages/ui/src/icons`, `packages/core`/module manifest, website-builder blocks, CMS routes, invite/onboarding pages, operator/platform-auth services | 2 each                                               | Leave. Two-copy pairs; the rule extracts on the third occurrence.                                                                                                                       |
| Sentry `edge`/`server` configs                                                                                                                         | 2                                                    | Leave. Framework bootstrap files with intentionally parallel config.                                                                                                                    |

## Why nothing was extracted

The two candidates that meet the "3+ occurrences" letter are the dashboard route
scaffolding and the table toolbars. Both fail the "small and local" half of the
rule: the first spans dozens of handlers and denial tests, the second is UI
application code with per-screen presentation. The icon wrapper meets "3+" but a
100-icon mechanical rewrite is not a small change. Per the decision rule, all
clusters are recorded and none is extracted on this branch.

## Re-running

```bash
pnpm dup:report                                  # full console report
pnpm dup:report > /tmp/jscpd.txt                 # keep a copy for triage
```

When a cluster is extracted, delete its row here and re-run to confirm the clone
count dropped. Do not raise the threshold or add a blanket ignore to hide a new
clone.
