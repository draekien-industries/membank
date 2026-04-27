# Changesets

This directory contains changeset files. Each file describes a change that should be included in the next release.

## Adding a changeset

```bash
pnpm changeset
```

Follow the prompts to select the affected packages and describe the change.

## Release workflow

- **Stable releases**: Push to `main`. If changesets are present, a "Version Packages" PR is created. Merging that PR triggers the publish.
- **Prerelease (`dev`)**: Push to `develop`. A snapshot release is automatically published to the `dev` dist-tag (e.g. `0.1.0-dev-20240427120000`).
