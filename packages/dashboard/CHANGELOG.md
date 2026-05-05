# @membank/dashboard

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
