# @membank/dashboard

Web UI for browsing, searching, and managing memories. Provides a full-featured dashboard to inspect memory storage, edit metadata, and review memories flagged for deduplication.

## Features

- **Browse memories** — list all stored memories with filtering by type, scope, and status
- **Search** — full-text search across memory content
- **View details** — inspect individual memories with full metadata
- **Edit metadata** — change memory type, tags, and pin status
- **Review flagged** — dedicated view for memories flagged `needs_review` during deduplication
- **Stats dashboard** — overview of total memory count, distribution by type, and dedup queue size
- **Dark mode** — theme toggle with system preference detection

## Quick start

Start the dashboard from the monorepo root:

```bash
pnpm dev
```

Or scoped to just the dashboard:

```bash
pnpm --filter @membank/dashboard dev
```

The server starts on `http://localhost:3847` and opens automatically.

## How it works

The dashboard runs both a React SPA frontend and a Hono API server:

- **Backend** — Express-like API server (`src/server/index.ts`) that connects to the SQLite memory database via `@membank/core`
- **Frontend** — React + TanStack Router + TanStack DB for client-side state management and async data fetching
- **Static serving** — built client assets served from the backend with SPA fallback (HTML history API)

## Project structure

```
src/
  server/
    index.ts         # Hono app with /api routes and static file serving
    dev.ts           # dev server launcher
  client/
    index.tsx        # app entry point
    index.css        # Tailwind + global styles
    routes/
      index.tsx      # root (redirects to /memories)
      memories.index.tsx        # list view
      memories.$id.tsx          # detail view
    components/
      MemoryRow.tsx  # single memory row with inline edit
      StatsBar.tsx   # memory count + dedup queue
      ThemeToggle.tsx
      ui/            # shadcn + base-ui components
    lib/
      api.ts         # client-side API client (fetch wrappers)
      types.ts       # shared TypeScript types
      utils.ts       # classname helpers (clsx/tailwind-merge)
```

## API endpoints

All requests/responses are JSON.

### `GET /api/memories`

List memories with optional filters.

Query params:
- `type` — filter by memory type (e.g., `correction`, `preference`)
- `scope` — filter by scope (e.g., `global`, project hash)
- `pinned=true` — show only pinned memories
- `needsReview=true` — show only flagged memories
- `search` — full-text search in content

Response: array of memory objects with `id`, `content`, `type`, `tags`, `scope`, `sourceHarness`, `accessCount`, `pinned`, `needsReview`, `createdAt`, `updatedAt`.

### `GET /api/memories/:id`

Fetch a single memory by ID.

### `PATCH /api/memories/:id`

Update a memory's metadata.

Body (all optional):
- `content` — update content (triggers re-embedding)
- `tags` — array of string tags
- `type` — change memory type
- `pinned` — boolean
- `needsReview` — boolean

### `DELETE /api/memories/:id`

Delete a memory (cascades to embeddings).

### `GET /api/stats`

Stats snapshot.

Response:
```json
{
  "byType": { "correction": 10, "preference": 5, ... },
  "total": 25,
  "needsReview": 2
}
```

## Commands

```bash
pnpm dev              # start dev server (watch mode, auto-reload)
pnpm build            # build SPA + server entry
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
pnpm lint:fix         # biome check --write
pnpm clean            # rm dist
```

## Tech stack

- **Runtime** — Node.js 24+
- **Server** — Hono 4 + @hono/node-server
- **Client** — React 19 + TanStack Router + TanStack DB
- **Styling** — Tailwind CSS 4 + shadcn components
- **Icons** — @phosphor-icons/react
- **Build** — Vite 6 (client) + tsdown (server)
- **Database** — @membank/core (SQLite via better-sqlite3)

## Database connection

The dashboard connects to the shared SQLite database at `~/.membank/memory.db` via `DatabaseManager.open()` from `@membank/core`. No special setup required — just ensure the database exists and has the expected schema (created by membank CLI/MCP setup).

## Development notes

- **Client-side routing** — TanStack Router with file-based routes in `src/client/routes/`
- **API calls** — `src/client/lib/api.ts` wraps fetch with error handling and JSON parsing
- **State management** — TanStack DB (replicated, reactive) + TanStack Query (async cache)
- **Styles** — Tailwind v4 with custom CSS variables for theme colors; dark mode via `prefers-color-scheme`
- **UI components** — shadcn + base-ui primitives, no external component library deps

## Port selection

Dashboard prefers port `3847` but falls back to an available port if occupied. Port is logged to stdout on startup.
