# Membank

LLM memory management system. Stores user preferences, corrections, decisions, and learnings in SQLite, queryable via semantic search. Distributed as an MCP server + CLI.

## Monorepo structure

```
packages/
  core/       @membank/core      — DB, embeddings, query engine, dedup logic
  mcp/        @membank/mcp       — stdio MCP server (5 tools exposed to LLMs) + standalone membank-mcp bin
  cli/        @membank/cli       — CLI + npx entrypoint
  dashboard/  @membank/dashboard — web UI + standalone membank-dashboard bin
```

`core` has no workspace deps. `mcp` depends on `core`. `cli` depends on `core` and `mcp`. `dashboard` is independent of `cli`. Build order is enforced by Turborepo. After you make a change, run `pnpm build` to rebuild in the correct order.

## Key commands

```bash
pnpm install          # install all workspace deps
pnpm build            # build all packages in dependency order
pnpm dev              # watch mode across all packages
pnpm lint             # biome check
pnpm lint:fix         # biome check --write
pnpm typecheck        # tsc --noEmit across all packages
pnpm clean            # remove all dist/ and *.tsbuildinfo
```

Run any command scoped to one package with `--filter`:

```bash
pnpm --filter @membank/core build
pnpm --filter @membank/cli dev
```

## Tooling

- **Runtime**: Node.js >=24, pnpm >=10 (managed via corepack)
- **Build**: tsdown (Rolldown-based, replaces tsup)
- **Lint/format**: Biome 2.x — single tool for both, no ESLint/Prettier
- **Git hooks**: Lefthook — runs `biome check` on staged files pre-commit
- **Monorepo**: Turborepo with `pnpm` workspaces

## Conventions

- All native deps (`better-sqlite3`, `sqlite-vec`) are external in tsdown configs — not bundled
- TypeScript and lint rules: see `.claude/rules/typescript.md`

## Changesets

Every feature branch or worktree that touches user-facing behaviour **must** include a changeset before the work is considered complete.

Create the file manually at `.changeset/<slug>.md` with a unique kebab-case slug and stage it alongside the code changes in the same commit:

```markdown
---
"@membank/<package>": patch | minor | major
---

One sentence describing what changed and why it matters to users.
```

Bump type:
- `patch` — bug fix, internal refactor, no API change
- `minor` — new feature, backwards-compatible
- `major` — breaking change

Description: past tense, one sentence, what changed and why it matters to users (not implementation detail).

**Skip only:** pure docs/test changes with no runtime effect.

## Release cycle

1. Feature PRs merged to `main` → CI creates/updates a `chore: version packages` PR (branch `changeset-release/main`) that batches all pending changesets
2. Merge the version PR → CI publishes the stable release to npm and creates GitHub releases

Changelog and release notes are generated automatically by changesets from the changeset descriptions — do not write them manually.

## Implementation checklist

After completing any implementation task, run `/simplify` to review the changes for reuse, quality, and efficiency before considering the work done.
