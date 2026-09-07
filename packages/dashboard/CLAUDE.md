# @membank/dashboard

Standalone web UI for browsing and managing memories. Distributed as `npx @membank/dashboard`.

- `src/client/` — React frontend (see `src/client/CLAUDE.md` for UI development rules)
- `src/server/` — Hono server that serves the built client and proxies MCP calls

When adding shadcn primitives: `cd` into the `./packages/dashboard` directory first.

Do not run `pnpm dev` for the dashboard yourself - it will almost always be already running.

## Tests

`pnpm --filter @membank/dashboard test` runs Vitest over `src/**/*.test.ts` (server-side only — no
DOM environment). `vitest.config.ts` aliases `@membank/core` and `@membank/core/test-support` to
core's source, so a core change needs no rebuild before dashboard tests see it.

## Dev database

`pnpm --filter @membank/dashboard dev:seed` regenerates a throwaway SQLite DB at
`packages/dashboard/.dev-db/memory.db` (gitignored, rebuilt from scratch on every run) with two
projects, memories across all five types, a flagged duplicate, a synthesis with version history,
and a synthesis stuck `in_flight` — the issue #111 state the unlock button recovers from.
Embeddings are not seeded, so semantic search returns nothing against this DB.

Point the dev server at it with `MEMBANK_DB_PATH`, which `src/server/dev.ts` honours (the shipped
server always uses `~/.membank/memory.db`):

```pwsh
$env:MEMBANK_DB_PATH = "F:\Dev\membank\packages\dashboard\.dev-db\memory.db"
pnpm --filter @membank/dashboard dev
```

The seed script imports `@membank/core/test-support` through the package exports, so core must be
built (`pnpm build`) before the first run.
