# @membank/core

## 0.13.0

### Minor Changes

- 4e8ebbb: Added bulk maintenance tools (delete_many, resolve_many) and a merge_memories tool, inlined the current conflicting memory and cluster groupings into list_flagged_memories, and broke get_memory_summary's review queue down by similarity band, type, and cluster count — so AI agents can clean up flagged memories in a fraction of the calls.

## 0.12.1

### Patch Changes

- 4aa43c3: Added `@membank/core/client` subpath export with browser-safe domain constants, so dashboard client code can import `GLOBAL_SCOPE_HASH` and friends without pulling Node.js-only native modules into the browser bundle.

## 0.12.0

### Minor Changes

- 3c966c3: Added activity log feature: records memory.created/updated/deleted/flagged/queried events in SQLite with 30-day prune-on-write retention, a `membank activity` CLI command, and an Activity tab in the dashboard for per-project and global timelines.

### Patch Changes

- 61a05d1: Introduced a sentinel global project (scope_hash `0000000000000000`, id `00000000-0000-0000-0000-000000000000`) so every memory has an explicit `memory_projects` row, eliminating `NOT IN` subqueries and fixing a bug where global memories were silently excluded from project-scoped semantic queries.
- dd7f393: Migrated `syntheses.scope` from the legacy `"global"` string to the sentinel scope hash, adding a foreign key from `syntheses.scope` to `projects.scope_hash` and eliminating all remaining `scope === "global"` magic-string branches.

## 0.11.1

### Patch Changes

- bbd64ef: Scoped stats(), listFlagged(), and getPinnedCharCount() to the current project so session-start stats, get_memory_summary, list_flagged_memories, and the pin budget check no longer report inflated global counts when operating within a project context.

## 0.11.0

### Minor Changes

- d68b4ca: Reworked the Claude Code Stop hook into an async, out-of-session memory extraction agent. When a session ends, the hook fires `membank extract` in the background; that command spawns an independent Claude Haiku agent that reads the session transcript and saves durable corrections, preferences, decisions, learnings, and facts via its own `save_memory` / `update_memory` tools. The extractor runs in its own Claude conversation with `settingSources: []` so it does not inherit the host's MCP servers or built-in tools — preventing the infinite Stop-loop that forced the previous attempt's rollback, and ensuring its tool calls land in the membank DB through the in-process SDK MCP server rather than the host's globally-configured `mcp__membank__*` tools.

  Applied the same isolation fix to the synthesis agent runner (`settingSources: []`, fully-qualified `mcp__membank-synthesis-tools__*` allowlist, host membank disallowed) so synthesis always reads from the services it was wired with rather than the host's globally-configured server.

  Stop / session-end hook setup for copilot-cli, codex, and opencode is removed pending verified session-end input contracts for those harnesses.

## 0.10.0

### Minor Changes

- 8ad48f1: Restructured all business logic into a layered domain/application/infrastructure architecture in core, making presentation packages (cli, mcp, dashboard) thin adapters with no SQL, no heavy native dependencies, and no direct infrastructure imports.

### Patch Changes

- 8ad48f1: Optimized published bundles: externalized `zod` from `core` and `mcp` to prevent duplicate instances in consumer projects, removed unused `@anthropic-ai/claude-agent-sdk` dependency from `mcp`, added `@membank/dashboard` to CLI's never-bundle list, and enabled minification on library outputs.

## 0.9.4

### Patch Changes

- 14efb94: Added schema migration (v5) that removes projects with non-hex scope_hash values (merging their memories into valid counterparts where possible), and adds a CHECK constraint to prevent corrupt scope_hash values from being inserted in future. Also added application-level validation in `ProjectRepository.upsertByHash()` that rejects hashes not matching the 16-character lowercase hex format.

## 0.9.3

### Patch Changes

- 6425890: Fixed synthesis generating empty content when a human-readable project name (e.g. `parasol`) was passed as the scope — project names are now resolved to their scope hash before querying memories and storing the synthesis. The synthesis agent also now correctly filters memories by the target project instead of always using the current directory's project. The `synthesize status` command now shows project names instead of raw scope hashes.

## 0.9.2

### Patch Changes

- e4f8cfd: Fix in-flight synthesis markers getting permanently stuck after a process crash on non-dirty scopes. Engine now clears stale markers at startup using the same timeout threshold as the debounce loop.

## 0.9.1

### Patch Changes

- f5d63a0: Fix package README docs to match current API and feature set.

## 0.9.0

### Minor Changes

- 3658eeb: Add get_memory_summary MCP tool for session orientation — returns total, byType counts, pinned count, and review queue size.
- 7994b23: Add pin budget warning when pinned memories exceed 8000 character threshold to prevent context bloat.
- b763c4d: Added SynthesisRepository and syntheses table (migration 4) for background memory summarization. SessionContext extended with optional synthesis field.

### Patch Changes

- 499a69d: Add type reclassification to update_memory — memories can now have their type changed without losing history.
- 3731650: Integrated cosine similarity into memory scoring formula to prioritize semantic relevance over type weight, rebalancing from `typeWeight × 0.4` to `cosine_sim × 0.4 + typeWeight × 0.25`

## 0.8.0

### Minor Changes

- c4f9f4a: Replaced the `needs_review` boolean on memories with a `memory_review_events` table that captures why each memory was flagged — including similarity score, conflicting memory id, and a content snapshot. The `Memory` type now carries `reviewEvents: ReviewEvent[]` instead of `needsReview: boolean`. MCP `query_memory` responses include review event details. A new `membank review` CLI command lists flagged memories with reasons and supports `--resolve <id>` to clear them. The dashboard detail panel shows a collapsible review reasons card.

  **Breaking change:** `Memory.needsReview` removed — use `memory.reviewEvents.length > 0` to check review status.

## 0.7.0

### Minor Changes

- abb83cd: query_memory now excludes pinned memories by default to avoid duplicating session-injected context; pass `includePinned: true` (MCP) or `--include-pinned` (CLI) to opt in.
- ee56f9c: Added zod runtime validation at DB and public-API boundaries in core; exported reusable schemas (MemoryTypeSchema, SaveOptionsSchema, QueryOptionsSchema, MemoryRowSchema, etc.) from @membank/core. MCP now uses these shared schemas instead of hand-rolled type checks. CLI MemoryTypeSchema and TagsRowSchema now re-exported from core to eliminate duplication.

## 0.6.1

### Patch Changes

- 0a3ac28: Removed the `--scope` / `scope` parameter from CLI and MCP in favour of automatic project detection. Added `--global` flag (CLI) and `global` boolean (MCP `save_memory`) to explicitly save a memory with no project association. Added `membank migrate list | run <name>` command and matching MCP `migrate` tool to rename auto-migrated projects to their resolved names.
- 11ab2bf: Extracted migration logic and registry into core, eliminating duplication between CLI and MCP. CLI pin/unpin commands now use MemoryRepository.setPin() instead of raw SQL.

## 0.6.0

### Minor Changes

- 19327d6: Added Projects as first-class entities: memories are now associated with named projects (derived from git remote or working directory) instead of raw SHA-256 hashes, and a memory can belong to multiple projects simultaneously or remain global (no associations).

## 0.5.1

### Patch Changes

- 5f48cae: Added `pin_memory` and `unpin_memory` MCP tools, and a `setPin` method on `MemoryRepository`, so LLMs and users can pin memories for guaranteed session injection or remove that flag.

## 0.5.0

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.0

## 0.1.1

### Patch Changes

- bf48969: Bump version to fix publish conflict with previously published 0.1.0.

## 0.1.0

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1

## 0.0.0

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
