# @membank/core

## 0.20.0

### Minor Changes

- 4c32001: Added capability memory: memories can now be attached to a tool or skill (e.g. `tool:Bash`, `skill:shadcn`) independent of any project, so transferable learnings are shared across projects instead of polluting global. Save and query them via the `tool:<name>`/`skill:<name>` scope, browse them in the dashboard's Capabilities view, and have a capability's memories injected automatically before that tool or skill is used (claude-code PreToolUse hook — re-run `membank setup` to register it).

## 0.19.0

### Minor Changes

- 672ec7b: Injected memory now shows pinned memories verbatim and a separate synthesis per memory type — with small groups quoted in full below a configurable word-count threshold — and any pre-existing combined synthesis is regenerated automatically on upgrade, so sessions start with sharper, type-aware context. The `synthesize` version commands (`show --version`, `diff`, `revert`) now take a required `--type`, and `history` shows a Type column with an optional `--type` filter.
- d1482b7: Added on-demand synthesis triggers to the project Overview tab: a "Synthesize all" action and per-type controls in the session-injection preview. Each memory type can be synthesized or regenerated individually, including verbatim sections that have grown past the synthesis word-count threshold but are not yet synthesized. "Synthesize all" and the per-type triggers now respect the threshold and only act on the project's own memories, so borrowed global sections stay read-only. Also fixed long synthesis summaries overflowing onto the sections below them in the preview.

## 0.18.0

### Minor Changes

- 5b2fc91: Memories created inside a git worktree now resolve to the parent repository's project instead of a separate orphan, and existing orphaned worktree projects can be reconciled into their parent via the CLI, MCP, and dashboard (with the dashboard also able to delete an orphaned project and its exclusive memories).

## 0.17.0

### Minor Changes

- 5d28da0: Tuned session memory extraction to save only stable, long-term memories (skipping transient task work) and to process large transcripts in chunks instead of truncating them.

## 0.16.0

### Minor Changes

- 6d462ec: Added `incrementAccessCountBy(id, delta)` to `MemoryRepository` to enable writing a bulk delta in one DB statement instead of N individual calls.
- 6d462ec: Added `primaryScopeHash` to the `Memory` type so callers no longer need to navigate `memory.projects[0]?.scopeHash` to get the effective scope hash.

### Patch Changes

- 6d462ec: Added `atomicMerge` to `MemoryRepository`, collapsing the 5-step merge sequence into a single SQLite transaction to prevent partial-merge corruption.
- 6d462ec: Changed `classifyDuplicate` to return `null` instead of `"none"` when no duplicate is detected, making the absence-of-match case idiomatic.
- 6d462ec: Fixed config loader silently swallowing all errors; now only suppresses ENOENT so malformed config.json surfaces to the user.
- 6d462ec: Refactored core package internals to address design-principle violations identified in audit: eliminated temporal decomposition in merge and synthesis init, fixed Law of Demeter violations on the Memory type, corrected information hiding in the query layer, and removed several shallow or duplicate abstractions.
- 6d462ec: Added `initializeAndGetDirtyScopes` to `SynthesisRepository` so the synthesis startup sequence (clear stale in-flight markers, expire stale records, return dirty scopes) executes atomically in a single transaction.
- 6d462ec: Refactored query layer to inject QueryAdapter into QueryEngine, moved Buffer conversion and incrementAccessCount into the adapter, and added createQueryEngine factory to keep SqliteQueryAdapter private.
- 6d462ec: Replaced flat `SessionContext` type with a discriminated union on `mode` field, making the two modes (synthesis vs pinned) explicit and preventing silent zeroing of pinned arrays when synthesis is present.

## 0.15.0

### Minor Changes

- 0d0c2ba: Activity events now capture content snapshots and query text in their payloads, enabling the dashboard's activity rows to expand and show the actual memory content that was saved, updated, deleted, or queried.

## 0.14.1

### Patch Changes

- 70139fe: Exported `suggestMerge` from the public API so the dashboard can use it at runtime.

## 0.14.0

### Minor Changes

- 58be30f: Added 5-version history with diff and revert for project syntheses.
- e8ddcbc: Added versioned memory history: each content update now archives the previous content (up to 10 versions per memory), enabling history inspection, diffing, and revert via `membank memory history|show|diff|revert` CLI commands and the `list_memory_history` MCP tool.

### Patch Changes

- a0d8705: Fixed type errors raised by enabling exactOptionalPropertyTypes in tsconfig.

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
