# Plan: Project Activity Log (issue #61, Phase 1)

## Context

Issue #61 asks for a project-scoped, 30-day activity log so users can see what membank is doing inside a project — what was saved/updated/deleted, what got flagged for review, and what was queried. Today membank is a black box from the outside.

**Scope locked with the user:**
- **Events**: 5 memory-lifecycle + query events only (`memory.created`, `memory.updated`, `memory.deleted`, `memory.flagged`, `memory.queried`). Granular extraction events deferred to a follow-up.
- **Retention**: 30 days, **prune-on-write** inside `logEvent()`.
- **Dashboard**: `Tabs` view inside the project workspace center pane (Memories | Activity).
- **MCP**: `list_activity` tool deferred.

## Architecture

New bounded context `packages/core/src/activity/` following the layered pattern enforced by `scripts/arch-lint.mjs`.

```
activity/
  domain/activity-event.ts          types + RETENTION_DAYS = 30
  ports.ts                          ActivityRepository, ActivityLogger
  application/log-event.ts          logEvent() — also prunes >30d on each write
  application/list-events.ts        listEvents({ projectHash?, type?, since?, limit })
  infrastructure/sqlite-activity-repository.ts
  index.ts                          public re-exports
```

### Schema (migration 7, append to `packages/core/src/db/manager.ts` `MIGRATIONS`)

```sql
CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  project_hash TEXT,                  -- nullable for global events
  event_type TEXT NOT NULL,           -- enum string
  memory_id TEXT,                     -- FK soft ref; no constraint (memory may be deleted)
  payload TEXT NOT NULL,              -- JSON string
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_project_created ON activity_events(project_hash, created_at DESC);
CREATE INDEX idx_activity_type_created ON activity_events(event_type, created_at DESC);
```

`memory_id` intentionally has no FK constraint so `memory.deleted` events survive the row's removal.

### Event emission sites

Wire `ActivityLogger` into existing use cases (zero changes to call-sites outside core):

| Event | Call site |
|---|---|
| `memory.created` | `memory/application/save-memory.ts` after `repo.create(...)` |
| `memory.updated` | `memory/application/update-memory.ts` AND `save-memory.ts` overwrite branch (dedup auto-merge) |
| `memory.deleted` | `memory/application/delete-memory.ts` |
| `memory.flagged` | `save-memory.ts` after `repo.createReviewEvent(...)` |
| `memory.queried` | `query/application/query-memories.ts` (one event per call, with `resultCount`, `topScores`) |

Inject `ActivityLogger` via the existing use-case dependency object (same pattern as `repo`, `clock`, etc.). Default no-op logger keeps unit tests green where activity isn't relevant.

### Pruning

`logEvent()` runs `DELETE FROM activity_events WHERE created_at < datetime('now', '-30 days')` after each insert. With `idx_activity_project_created`, the delete is index-scan-bounded; on a small DB this is microseconds. Document as the project's first prune-on-write pattern in `packages/core/src/activity/CLAUDE.md` (short — one paragraph).

## Dashboard

**Per `packages/dashboard/src/client/CLAUDE.md` workflow:**
1. `/shadcn` to confirm `tabs` is missing → `cd packages/dashboard && npx shadcn add tabs`.
2. `/react-composition-rules` CREATE mode before writing `ActivityTimeline`, `ActivityEventRow`, `useProjectActivityEvents`.

**Routes** (TanStack Router file-based):
- Modify `packages/dashboard/src/client/routes/$projectId.tsx` to render `<Tabs>` in the center pane (`WorkspaceCenter`) — `Memories` (existing) | `Activity` (new). Same for `global.tsx`.
- Tab state stored in URL search param (`?tab=activity`) via `validateSearch` zod schema already on these routes — reuse existing pattern.

**New server endpoint** (`packages/dashboard/src/server/index.ts`):
- `GET /api/projects/:id/activity/events?type=&since=&limit=` → `ActivityEvent[]`
- `GET /api/activity/events?...` (global variant)

Calls `core.activity.listEvents(...)`. Existing `/api/projects/:id/activity` (daily counts) stays untouched for the sparkline.

**Client wrappers**:
- Add `getProjectActivityEvents` / `getGlobalActivityEvents` to `src/client/lib/api.ts`.
- New hook `src/client/hooks/useProjectActivityEvents.ts` mirroring `useProjectActivity.ts` (plain `useState`+`useEffect`+fetch — activity is server-aggregated, not live data, so TanStack DB isn't needed here).

**Components** (all in `src/client/components/` or `src/client/views/`):
- `ActivityTimeline.tsx` — groups events by `created_at.slice(0,10)`, renders sticky day headers (reuse existing `MemoryRow` group-header pattern in `WorkspaceCenter`), feeds into `ActivityEventRow`. Reuses the `WorkspaceCenter` scroll-body / footer-count shell.
- `ActivityEventRow.tsx` — single row: event-type chip + memory-type chip (if `memory_id`) + summary + relative timestamp. Two-line layout matching existing `MemoryRow` density (~56px, `py-3`, `gap-1.5`).
- Event-type chip variants: reuse existing `Badge` variants from `src/client/components/ui/badge.tsx`:
  - `memory.created` → `default`
  - `memory.updated` → `outline`
  - `memory.deleted` → `destructive`
  - `memory.flagged` → `stale`
  - `memory.queried` → `secondary`
  - Memory-type chip (when present) uses the existing `correction`/`preference`/`decision`/`learning`/`fact` variants.

  Do **not** register new tokens.
- Empty state: reuse `<Empty>` primitive from `components/ui/empty.tsx`.

## CLI

Add `membank activity` (`packages/cli/src/commands/activity.ts`, registered in `src/index.ts`). Mirrors `stats.ts`.

Options: `--type <event_type>`, `--since <duration|date>`, `--memory-id <id>`, `--limit <n>` (default 50), `--global` (cross-project), `--json` (uses global formatter).

Pretty output: grouped-by-day list with type chips colored via existing `chalk` palette in `src/cli/formatter.ts`.

## Critical files to modify

- `packages/core/src/db/manager.ts` — append migration 7
- `packages/core/src/index.ts` — re-export `./activity/index.js`
- `packages/core/src/memory/application/{save-memory,update-memory,delete-memory}.ts` — emit events
- `packages/core/src/query/application/query-memories.ts` — emit event
- `packages/core/src/memory/ports.ts` — extend use-case deps with `activityLogger`
- `packages/core/src/index.ts` composition root — wire concrete logger
- `packages/dashboard/src/server/index.ts` — two new endpoints
- `packages/dashboard/src/client/routes/$projectId.tsx`, `global.tsx` — tabs
- `packages/cli/src/index.ts` — register command

## New files

- `packages/core/src/activity/**` (5–6 files)
- `packages/dashboard/src/client/components/ActivityTimeline.tsx`
- `packages/dashboard/src/client/components/ActivityEventRow.tsx`
- `packages/dashboard/src/client/hooks/useProjectActivityEvents.ts`
- `packages/cli/src/commands/activity.ts`
- `.changeset/activity-log.md` — `@membank/core`, `@membank/cli`, `@membank/dashboard` minor

## Verification

1. `pnpm build && pnpm typecheck && pnpm lint` — clean.
2. `pnpm --filter @membank/core test` — add unit tests for `logEvent` (asserts insert + prune) and `listEvents` (asserts project scoping, type filter, ordering).
3. Manual end-to-end:
   - `pnpm --filter @membank/cli dev`, save 3 memories, query once, delete one → `node packages/cli/dist/index.js activity` shows 5 events.
   - Inject content that triggers dedup flag (similarity 0.75–0.92) → `memory.flagged` appears.
   - Run `pnpm --filter @membank/dashboard dev`, open a project, click **Activity** tab → timeline renders grouped by day; deleting a memory from Memories tab updates Activity on next load.
   - Verify cross-project isolation: switch project; events from project A do not appear.
4. Manually backdate a row to 31 days ago, write another event → backdated row is gone (prune-on-write).
