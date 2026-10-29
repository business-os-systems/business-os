# Platform migration status

**Recorded**: 2026-10-26

| Field | Value |
|---|---|
| Last deploy workflow run | `39623062683` |
| Branch | `deploy-dev` |
| Commit | `4cf5db4` |
| Result | success |
| Run time | 2026-10-21 |
| Platform migrations added | `20261025161000_platform_foundation`, `20261025172000_platform_views` (2026-10-25) |

The last deploy workflow run predates both Platform migrations. No later `deploy-dev` run exists, so the deployed dev database has not been verified as migrated. This is a recorded negative result, not proof that a manual migration was never applied.

## Required action

1. Update `deploy-dev` to the merge commit that includes this change.
2. Run the deploy workflow.
3. Run `deploy/platform/verify-migrations.sh` and record the run id on #255.

The workflow runs `prisma migrate status` after `prisma migrate deploy` and checks a real `app_platform` connection.
