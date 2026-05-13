# @membank/mcp

## 0.12.2

### Patch Changes

- 14efb94: Added schema migration (v5) that removes projects with non-hex scope_hash values (merging their memories into valid counterparts where possible), and adds a CHECK constraint to prevent corrupt scope_hash values from being inserted in future. Also added application-level validation in `ProjectRepository.upsertByHash()` that rejects hashes not matching the 16-character lowercase hex format.
- Updated dependencies [14efb94]
  - @membank/core@0.9.4

## 0.12.1

### Patch Changes

- a8b26f2: remove turn limit on agent loop
- 6425890: Fixed synthesis generating empty content when a human-readable project name (e.g. `parasol`) was passed as the scope — project names are now resolved to their scope hash before querying memories and storing the synthesis. The synthesis agent also now correctly filters memories by the target project instead of always using the current directory's project. The `synthesize status` command now shows project names instead of raw scope hashes.
- Updated dependencies [6425890]
  - @membank/core@0.9.3

## 0.12.0

### Minor Changes

- 5ca75cb: Add `membank synthesize run` command to trigger a one-shot synthesis from the CLI, and export `runSynthesis` and `buildSynthesisTools` from `@membank/mcp` for use outside the MCP server.

### Patch Changes

- e4f8cfd: Fix in-flight synthesis markers getting permanently stuck after a process crash on non-dirty scopes. Engine now clears stale markers at startup using the same timeout threshold as the debounce loop.
- Updated dependencies [e4f8cfd]
  - @membank/core@0.9.2

## 0.11.2

### Patch Changes

- 85cd121: Fixed synthesis agent using bypassPermissions instead of dontAsk so in-process MCP tools are not blocked by permission evaluation.

## 0.11.1

### Patch Changes

- f5d63a0: Fix package README docs to match current API and feature set.
- 61d7c6e: Fixed synthesis failing for users authenticated via `claude auth login` (keychain) by removing the incorrect pre-flight env var check; updated setup prompt to list all three valid auth paths (keychain, ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN).
- Updated dependencies [f5d63a0]
  - @membank/core@0.9.1

## 0.11.0

### Minor Changes

- bf4acd7: Add optional `global` parameter to query_memory tool to scope queries by project.
- b051d40: Add list_flagged_memories and resolve_review MCP tools to expose dedup review queue.
- 3658eeb: Add get_memory_summary MCP tool for session orientation — returns total, byType counts, pinned count, and review queue size.
- 7994b23: Add pin budget warning when pinned memories exceed 8000 character threshold to prevent context bloat.
- b763c4d: Added SynthesisEngine for background memory synthesis via Claude Haiku. Adaptive 45s debounce, per-scope in-flight guards, SHA-256 drift detection, 30-day TTL. Synthesis replaces verbatim pinned injection when available; falls back gracefully when absent or in-flight.

### Patch Changes

- 499a69d: Add type reclassification to update_memory — memories can now have their type changed without losing history.
- 29010c6: Add missing provenance fields (createdAt, updatedAt, sourceHarness) to query_memory results
- Updated dependencies [499a69d]
- Updated dependencies [3658eeb]
- Updated dependencies [7994b23]
- Updated dependencies [b763c4d]
- Updated dependencies [3731650]
  - @membank/core@0.9.0

## 0.10.0

### Minor Changes

- c4f9f4a: Replaced the `needs_review` boolean on memories with a `memory_review_events` table that captures why each memory was flagged — including similarity score, conflicting memory id, and a content snapshot. The `Memory` type now carries `reviewEvents: ReviewEvent[]` instead of `needsReview: boolean`. MCP `query_memory` responses include review event details. A new `membank review` CLI command lists flagged memories with reasons and supports `--resolve <id>` to clear them. The dashboard detail panel shows a collapsible review reasons card.

  **Breaking change:** `Memory.needsReview` removed — use `memory.reviewEvents.length > 0` to check review status.

### Patch Changes

- Updated dependencies [c4f9f4a]
  - @membank/core@0.8.0

## 0.9.0

### Minor Changes

- abb83cd: query_memory now excludes pinned memories by default to avoid duplicating session-injected context; pass `includePinned: true` (MCP) or `--include-pinned` (CLI) to opt in.
- ee56f9c: Added zod runtime validation at DB and public-API boundaries in core; exported reusable schemas (MemoryTypeSchema, SaveOptionsSchema, QueryOptionsSchema, MemoryRowSchema, etc.) from @membank/core. MCP now uses these shared schemas instead of hand-rolled type checks. CLI MemoryTypeSchema and TagsRowSchema now re-exported from core to eliminate duplication.

### Patch Changes

- Updated dependencies [abb83cd]
- Updated dependencies [ee56f9c]
  - @membank/core@0.7.0

## 0.8.0

### Minor Changes

- 0a3ac28: Removed the `--scope` / `scope` parameter from CLI and MCP in favour of automatic project detection. Added `--global` flag (CLI) and `global` boolean (MCP `save_memory`) to explicitly save a memory with no project association. Added `membank migrate list | run <name>` command and matching MCP `migrate` tool to rename auto-migrated projects to their resolved names.

### Patch Changes

- 11ab2bf: Extracted migration logic and registry into core, eliminating duplication between CLI and MCP. CLI pin/unpin commands now use MemoryRepository.setPin() instead of raw SQL.
- Updated dependencies [0a3ac28]
- Updated dependencies [11ab2bf]
  - @membank/core@0.6.1

## 0.7.0

### Minor Changes

- 19327d6: Added Projects as first-class entities: memories are now associated with named projects (derived from git remote or working directory) instead of raw SHA-256 hashes, and a memory can belong to multiple projects simultaneously or remain global (no associations).

### Patch Changes

- Updated dependencies [19327d6]
  - @membank/core@0.6.0

## 0.6.0

### Minor Changes

- 5f48cae: Added `pin_memory` and `unpin_memory` MCP tools, and a `setPin` method on `MemoryRepository`, so LLMs and users can pin memories for guaranteed session injection or remove that flag.

### Patch Changes

- Updated dependencies [5f48cae]
  - @membank/core@0.5.1

## 0.5.0

### Patch Changes

- aded6f1: remove `@latest` tag from npx command
  - @membank/core@0.5.0

## 0.4.1

### Patch Changes

- @membank/core@0.4.1

## 0.4.0

### Patch Changes

- @membank/core@0.4.0

## 0.3.0

### Patch Changes

- @membank/core@0.3.0

## 0.2.0

### Patch Changes

- @membank/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [bf48969]
  - @membank/core@0.1.1

## 0.1.0

### Patch Changes

- @membank/core@0.1.0

## 0.0.4

### Patch Changes

- @membank/core@0.0.4

## 0.0.3

### Patch Changes

- @membank/core@0.0.3

## 0.0.2

### Patch Changes

- @membank/core@0.0.2

## 0.0.1

### Patch Changes

- @membank/core@0.0.1

## 0.0.0

### Patch Changes

- @membank/core@0.0.0

## 0.0.0-dev-20260427133418

### Minor Changes

- f05c13b: Initial release of the membank packages.

  **@membank/core** — SQLite-backed memory storage engine with vector search (DRA-31):

  - `DatabaseManager`: schema initialisation and migrations
  - `ScopeResolver`: project scope derived from git remote hash with cwd fallback
  - `EmbeddingService`: `bge-small-en-v1.5` model download and embed pipeline
  - `MemoryRepository`: full CRUD with cosine-similarity deduplication (auto-overwrite >0.92, flag >0.75)
  - `QueryEngine`: semantic search with confidence scoring and type-weight ranking
  - `SessionContextBuilder`: deterministic context injection — stats, pinned global and project memories

  **@membank/mcp** — stdio MCP server exposing five tools to LLM harnesses (DRA-32):

  - `list_memory_types`, `query_memory`, `save_memory`, `update_memory`, `delete_memory`
  - Full error hardening and process lifecycle management

  **@membank/cli** — `membank` CLI and npx entrypoint (DRA-34):

  - `query`, `add`, `list`, `stats`, `pin`, `unpin`, `delete`, `export`, `import` commands
  - `setup` command with `HarnessDetector`, `HarnessConfigWriter`, and `ModelDownloader`; auto-detects installed harnesses and writes MCP config
  - `--harness`, `--json`, and `--mcp` flags; partial failure reporting on setup

### Patch Changes

- Updated dependencies [f05c13b]
  - @membank/core@0.0.0-dev-20260427133418
