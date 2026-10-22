# Changesets

Hello and welcome! This folder has been setup to configure Changesets for the Business OS monorepo.

## Adding a changeset

To add a changeset, run:

```bash
pnpm changeset
```

Follow the prompts to specify the affected packages, bump types (`patch`, `minor`, `major`), and summary message.

## Versioning & Releasing

To consume changesets and bump package versions according to SemVer:

```bash
pnpm version-packages
```

To publish/release updated packages:

```bash
pnpm release
```
