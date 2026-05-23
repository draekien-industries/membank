# @membank/dashboard

## 0.12.1

### Patch Changes

- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
- Updated dependencies [6d462ec]
  - @membank/core@0.16.0

## 0.12.0

### Minor Changes

- 0d0c2ba: Activity events now capture content snapshots and query text in their payloads, enabling the dashboard's activity rows to expand and show the actual memory content that was saved, updated, deleted, or queried.

### Patch Changes

- Updated dependencies [0d0c2ba]
  - @membank/core@0.15.0

## 0.11.1

### Patch Changes

- Updated dependencies [70139fe]
  - @membank/core@0.14.1

## 0.11.0

### Minor Changes

- b622ded: Added dedicated review workflow at `/review` with cluster visualisation, side-by-side memory comparison, AI-powered merge synthesis, and per-event "Delete conflicting" action in memory detail.

### Patch Changes

- 17930da: Replaced onClick navigate handlers with AppLink in WorkspaceNav and ProjectOverviewDashboard for proper anchor semantics and hover preloading.

## 0.10.0

### Minor Changes

- 58be30f: Added a History section to the project synthesis panel with version list, line-level diff, and revert.
- e8ddcbc: Added versioned memory history: each content update now archives the previous content (up to 10 versions per memory), enabling history inspection, diffing, and revert via `membank memory history|show|diff|revert` CLI commands and the `list_memory_history` MCP tool.

### Patch Changes

- Updated dependencies [a0d8705]
- Updated dependencies [58be30f]
- Updated dependencies [e8ddcbc]
  - @membank/core@0.14.0

## 0.9.1

### Patch Changes

- Updated dependencies [4e8ebbb]
  - @membank/core@0.13.0

## 0.9.0

### Minor Changes

- 3487254: Pinned the global project as a full-width hero row on the dashboard landing so its inherited-by-all-projects role is unmistakable.
- 8fef2e1: Redesigned the project Overview tab into a four-region dashboard showing memory composition bars, attention signals (flagged count, synthesis freshness, pinned count), recent activity, and the session injection preview.
- 75466da: Split the project Overview tab into a two-panel layout — memory synthesis on the left, session injection preview on the right — each scrolling independently.
- 6817d51: Redesigned project view: synthesis and session context now live in a permanent Overview tab (default landing), with memories and activity as peer tabs. Opening a memory detail slides in as a right-side drawer overlay so the project context behind it is never unmounted.

### Patch Changes

- 79e0181: Fixed duplicate "global" cards on the projects landing screen caused by the sentinel project row being added to the DB while a hardcoded synthetic card still existed. The sentinel now renders via the standard project mapping. Also fixed the global workspace memory filter to use sentinel project membership instead of an empty-projects check, which was returning zero results after migration 7 backfilled all global memories.
- f2a32a6: Folded the standalone synthesis panel into the session injection preview on the Overview tab, eliminating duplicate content and making the preview the single source of truth for what gets injected into each session.
- 1190e0d: Removed redundant and misleading stats (Harness, Last Active, Needs Review, Corrections) from project cards on the dashboard landing page.
- Updated dependencies [4aa43c3]
  - @membank/core@0.12.1

## 0.8.0

### Minor Changes

- 3c966c3: Added activity log feature: records memory.created/updated/deleted/flagged/queried events in SQLite with 30-day prune-on-write retention, a `membank activity` CLI command, and an Activity tab in the dashboard for per-project and global timelines.
- 9d637cf: Added Session Context panel to the project page, showing the full injection payload (stats, pinned memories or synthesis, memory guidance) as a live monospace preview that updates reactively when memories are pinned or unpinned.

### Patch Changes

- 44a4658: Fixed right panel shrinking when switching between project summary and memory detail views.
- Updated dependencies [3c966c3]
- Updated dependencies [61a05d1]
- Updated dependencies [dd7f393]
  - @membank/core@0.12.0

## 0.7.1

### Patch Changes

- Updated dependencies [bbd64ef]
  - @membank/core@0.11.1

## 0.7.0

### Minor Changes

- 8772d37: Added a project synthesis panel to the dashboard: selecting a project in the memory filter now shows the AI-generated synthesis for that project in the detail pane, with Generate/Regenerate controls and live in-flight state.
- 8772d37: Added v2 dashboard with project-picker landing page and three-column workspace. The new UI is accessible at `/v2` and introduces per-project activity heatmaps, stats cards, and a workspace with a dedicated navigation sidebar, memory list, and detail panel — all scoped to a single project context.
- 8772d37: Added a /global route to the dashboard for browsing and managing global memories (memories not associated with any project). The Global card on the projects landing page now navigates into this workspace.

### Patch Changes

- 8772d37: Fixed the Global project card on the dashboard showing the total memory count across all projects instead of only global-scoped memories.
- 8772d37: Project cards now navigate to their workspace when clicked, using correctly typed TanStack Router link options instead of plain href strings.
- 8772d37: Removed the legacy v1 memories route and promoted the v2 workspace as the default home page. Project cards now use shadcn Card primitives and flex-wrap layout for better desktop density.
- 8772d37: Added a reset mechanism for stuck synthesis: after 60 seconds in-flight, a "Taking too long? Reset" affordance appears that clears the flag and allows retriggering.
- 8772d37: Added Lightning icon buttons to project group headers and the project filter bar so the synthesis panel is discoverable without prior knowledge of the filter mechanic.
- Updated dependencies [d68b4ca]
  - @membank/core@0.11.0

## 0.6.0

### Minor Changes

- cf7ae76: Added standalone `membank-dashboard` binary — users can now run `npx @membank/dashboard` directly with `--port` support, without installing the full CLI package.

### Patch Changes

- 8ad48f1: Restructured all business logic into a layered domain/application/infrastructure architecture in core, making presentation packages (cli, mcp, dashboard) thin adapters with no SQL, no heavy native dependencies, and no direct infrastructure imports.
- cf7ae76: Added ora spinner and styled ready message to the membank-dashboard bin; added --open flag to opt into browser auto-open on startup.
- 8ad48f1: Optimized published bundles: externalized `zod` from `core` and `mcp` to prevent duplicate instances in consumer projects, removed unused `@anthropic-ai/claude-agent-sdk` dependency from `mcp`, added `@membank/dashboard` to CLI's never-bundle list, and enabled minification on library outputs.
- Updated dependencies [8ad48f1]
- Updated dependencies [8ad48f1]
  - @membank/core@0.10.0

## 0.5.5

### Patch Changes

- Updated dependencies [14efb94]
  - @membank/core@0.9.4

## 0.5.4

### Patch Changes

- Updated dependencies [6425890]
  - @membank/core@0.9.3

## 0.5.3

### Patch Changes

- Updated dependencies [e4f8cfd]
  - @membank/core@0.9.2

## 0.5.2

### Patch Changes

- f5d63a0: Fix package README docs to match current API and feature set.
- Updated dependencies [f5d63a0]
  - @membank/core@0.9.1

## 0.5.1

### Patch Changes

- Updated dependencies [499a69d]
- Updated dependencies [3658eeb]
- Updated dependencies [7994b23]
- Updated dependencies [b763c4d]
- Updated dependencies [3731650]
  - @membank/core@0.9.0

## 0.5.0

### Minor Changes

- c4f9f4a: Replaced the `needs_review` boolean on memories with a `memory_review_events` table that captures why each memory was flagged — including similarity score, conflicting memory id, and a content snapshot. The `Memory` type now carries `reviewEvents: ReviewEvent[]` instead of `needsReview: boolean`. MCP `query_memory` responses include review event details. A new `membank review` CLI command lists flagged memories with reasons and supports `--resolve <id>` to clear them. The dashboard detail panel shows a collapsible review reasons card.

  **Breaking change:** `Memory.needsReview` removed — use `memory.reviewEvents.length > 0` to check review status.

### Patch Changes

- d3df280: Filters now persist when selecting, deselecting, or deleting a memory. Added a clear-filters button (Eraser icon) and Escape shortcut to reset all active filters at once.
- Updated dependencies [c4f9f4a]
  - @membank/core@0.8.0

## 0.4.1

### Patch Changes

- Updated dependencies [abb83cd]
- Updated dependencies [ee56f9c]
  - @membank/core@0.7.0

## 0.4.0

### Minor Changes

- c669408: Migrated MemoryDetail form to TanStack React Form with Zod validation, replacing manual per-field state and adding inline field error display via shadcn Field components.

## 0.3.1

### Patch Changes

- Updated dependencies [0a3ac28]
- Updated dependencies [11ab2bf]
  - @membank/core@0.6.1

## 0.3.0

### Minor Changes

- 8ad1190: Added keyboard navigation to the memory list using TanStack Hotkeys: ↑/↓ to navigate rows, Enter to open, P to pin, D/Delete to delete (with confirm), Escape to close or cancel, and ? to show a shortcut map. Fixed WCAG 2.1 focus-visible regression on hover-only action buttons and added an ARIA live region for search result announcements.

### Patch Changes

- Updated dependencies [19327d6]
  - @membank/core@0.6.0

## 0.2.3

### Patch Changes

- Updated dependencies [5f48cae]
  - @membank/core@0.5.1

## 0.2.2

### Patch Changes

- 56ff68f: Added CJS output and type declarations to the dashboard package build.
  - @membank/core@0.5.0

## 0.2.1

### Patch Changes

- @membank/core@0.4.1

## 0.2.0

### Minor Changes

- 356a873: Migrated dashboard to TanStack Router (file-based routing with Vite plugin, URL-synced filters as typed search params) and TanStack DB (reactive QueryCollection with optimistic pin/delete mutations).

### Patch Changes

- @membank/core@0.4.0

## 0.1.0

### Minor Changes

- 5b00b4e: Added `membank dashboard` command that opens a browser-based UI for browsing, filtering, editing, pinning, and approving memories stored in SQLite.

### Patch Changes

- @membank/core@0.3.0
