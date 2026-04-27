# Membank

LLM memory management system. Stores user preferences, corrections, decisions, and learnings in SQLite, queryable via semantic search. Distributed as an MCP server + CLI.

## Monorepo structure

```
packages/
  core/       @membank/core   — DB, embeddings, query engine, dedup logic
  mcp/        @membank/mcp    — stdio MCP server (5 tools exposed to LLMs)
  cli/        @membank/cli    — CLI + npx entrypoint, also starts MCP server
  dashboard/  @membank/dash   — web UI (stub, not yet implemented)
```

`core` has no workspace deps. `mcp` depends on `core`. `cli` depends on `core` and `mcp`. Build order is enforced by Turborepo.

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

## Architecture decisions

- **Storage**: SQLite at `~/.membank/memory.db` via `better-sqlite3` + `sqlite-vec` for vector search
- **Embeddings**: `bge-small-en-v1.5` via `@huggingface/transformers`, CPU-only, cached at `~/.membank/models/`
- **Dedup**: cosine similarity >0.92 same type+scope = auto-overwrite; 0.75–0.92 = flag `needs_review`
- **Session injection**: stats + all pinned global memories + all pinned project memories (deterministic, not algorithmic)
- **Project scope**: derived from `git remote get-url origin` hash, fallback to cwd hash

## Memory schema

```
id, content, type, tags[], scope, embedding, source_harness,
access_count, pinned, needs_review, created_at, updated_at
```

Types (enum): `correction` > `preference` > `decision` > `learning` > `fact`

## MCP tools

`query_memory`, `save_memory`, `update_memory`, `delete_memory`, `list_memory_types`

## CLI commands

`query`, `add`, `list`, `pin`, `unpin`, `delete`, `stats`, `export`, `import`, `setup`

`setup` auto-detects installed harnesses and writes MCP config. `--harness <name>` to target specific. `--yes` / `--json` for non-interactive use.

## Conventions

- All native deps (`better-sqlite3`, `sqlite-vec`) are external in tsdown configs — not bundled
- TypeScript and lint rules: see `.claude/rules/typescript.md`
