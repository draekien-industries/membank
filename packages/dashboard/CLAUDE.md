# @membank/dashboard

Standalone web UI for browsing and managing memories. Distributed as `npx @membank/dashboard`.

- `src/client/` — React frontend (see `src/client/CLAUDE.md` for UI development rules)
- `src/server/` — Hono server that serves the built client and proxies MCP calls

When adding shadcn primitives: `cd` into the `./packages/dashboard` directory first.
