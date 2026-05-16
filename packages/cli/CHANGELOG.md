# @membank/cli

## 0.15.0

### Minor Changes

- 30ac477: For claude-code, dropped the in-session save_memory nudge and removed UserPromptSubmit from the default hook setup now that SessionEnd auto-extracts memories. Existing UserPromptSubmit membank entries in `~/.claude/settings.json` are auto-stripped on next `membank setup` run. Copilot-cli and codex are unchanged.

### Patch Changes

- Updated dependencies [4e8ebbb]
- Updated dependencies [f07fe18]
  - @membank/mcp@0.15.0
  - @membank/core@0.13.0

## 0.14.2

### Patch Changes

- e8d22da: Switched memory extraction trigger from the `Stop` hook (fired every turn) to the `SessionEnd` hook (fired once per session), eliminating the recursion bug class and reducing unnecessary LLM synthesis calls. Existing installs must re-run `membank setup` to migrate the hook entry in `~/.claude/settings.json`.

## 0.14.1

### Patch Changes

- Updated dependencies [4aa43c3]
  - @membank/core@0.12.1
  - @membank/mcp@0.14.3

## 0.14.0

### Minor Changes

- 3c966c3: Added activity log feature: records memory.created/updated/deleted/flagged/queried events in SQLite with 30-day prune-on-write retention, a `membank activity` CLI command, and an Activity tab in the dashboard for per-project and global timelines.

### Patch Changes

- Updated dependencies [3c966c3]
- Updated dependencies [61a05d1]
- Updated dependencies [dd7f393]
  - @membank/core@0.12.0
  - @membank/mcp@0.14.2

## 0.13.1

### Patch Changes

- Updated dependencies [bbd64ef]
  - @membank/core@0.11.1
  - @membank/mcp@0.14.1

## 0.13.0

### Minor Changes

- d68b4ca: Reworked the Claude Code Stop hook into an async, out-of-session memory extraction agent. When a session ends, the hook fires `membank extract` in the background; that command spawns an independent Claude Haiku agent that reads the session transcript and saves durable corrections, preferences, decisions, learnings, and facts via its own `save_memory` / `update_memory` tools. The extractor runs in its own Claude conversation with `settingSources: []` so it does not inherit the host's MCP servers or built-in tools — preventing the infinite Stop-loop that forced the previous attempt's rollback, and ensuring its tool calls land in the membank DB through the in-process SDK MCP server rather than the host's globally-configured `mcp__membank__*` tools.

  Applied the same isolation fix to the synthesis agent runner (`settingSources: []`, fully-qualified `mcp__membank-synthesis-tools__*` allowlist, host membank disallowed) so synthesis always reads from the services it was wired with rather than the host's globally-configured server.

  Stop / session-end hook setup for copilot-cli, codex, and opencode is removed pending verified session-end input contracts for those harnesses.

### Patch Changes

- Updated dependencies [d68b4ca]
  - @membank/core@0.11.0
  - @membank/mcp@0.14.0

## 0.12.0

### Minor Changes

- cf7ae76: Removed `@membank/dashboard` as a CLI dependency, significantly reducing the `npx @membank/cli` install footprint. The `membank dashboard` command now prints a migration message directing users to `npx @membank/dashboard`. Added `membank setup upgrade` to automatically migrate existing harness configs from `npx @membank/cli --mcp` to the new `npx @membank/mcp` standalone binary. New harness setups configured by `membank setup` now use `npx @membank/mcp` by default.

### Patch Changes

- 8ad48f1: Restructured all business logic into a layered domain/application/infrastructure architecture in core, making presentation packages (cli, mcp, dashboard) thin adapters with no SQL, no heavy native dependencies, and no direct infrastructure imports.
- 8ad48f1: Optimized published bundles: externalized `zod` from `core` and `mcp` to prevent duplicate instances in consumer projects, removed unused `@anthropic-ai/claude-agent-sdk` dependency from `mcp`, added `@membank/dashboard` to CLI's never-bundle list, and enabled minification on library outputs.
- Updated dependencies [8ad48f1]
- Updated dependencies [8ad48f1]
- Updated dependencies [cf7ae76]
  - @membank/core@0.10.0
  - @membank/mcp@0.13.0

## 0.11.2

### Patch Changes

- Updated dependencies [14efb94]
  - @membank/core@0.9.4
  - @membank/mcp@0.12.2
  - @membank/dashboard@0.5.5

## 0.11.1

### Patch Changes

- 6425890: Fixed synthesis generating empty content when a human-readable project name (e.g. `parasol`) was passed as the scope — project names are now resolved to their scope hash before querying memories and storing the synthesis. The synthesis agent also now correctly filters memories by the target project instead of always using the current directory's project. The `synthesize status` command now shows project names instead of raw scope hashes.
- Updated dependencies [a8b26f2]
- Updated dependencies [6425890]
  - @membank/mcp@0.12.1
  - @membank/core@0.9.3
  - @membank/dashboard@0.5.4

## 0.11.0

### Minor Changes

- 5ca75cb: Add `membank synthesize run` command to trigger a one-shot synthesis from the CLI, and export `runSynthesis` and `buildSynthesisTools` from `@membank/mcp` for use outside the MCP server.

### Patch Changes

- Updated dependencies [5ca75cb]
- Updated dependencies [e4f8cfd]
  - @membank/mcp@0.12.0
  - @membank/core@0.9.2
  - @membank/dashboard@0.5.3

## 0.10.2

### Patch Changes

- 681d558: Fixed Stop hook output for claude-code harness to emit `{}` instead of an invalid `hookSpecificOutput` block, which caused a JSON schema validation error on session end.
- Updated dependencies [85cd121]
  - @membank/mcp@0.11.2

## 0.10.1

### Patch Changes

- f5d63a0: Fix package README docs to match current API and feature set.
- 61d7c6e: Fixed synthesis failing for users authenticated via `claude auth login` (keychain) by removing the incorrect pre-flight env var check; updated setup prompt to list all three valid auth paths (keychain, ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN).
- Updated dependencies [f5d63a0]
- Updated dependencies [61d7c6e]
  - @membank/core@0.9.1
  - @membank/dashboard@0.5.2
  - @membank/mcp@0.11.1

## 0.10.0

### Minor Changes

- b763c4d: Added config system and synthesis management commands. ConfigManager reads/writes ~/.membank/config.json. New commands: `membank config` (get/set/show) and `membank synthesize` (show/status). Synthesis opt-in prompt added to setup flow.
- abece34: Add Stop hook to capture session-end memories.
- 7994b23: Add pin budget warning when pinned memories exceed 8000 character threshold to prevent context bloat.

### Patch Changes

- Updated dependencies [bf4acd7]
- Updated dependencies [b051d40]
- Updated dependencies [499a69d]
- Updated dependencies [3658eeb]
- Updated dependencies [7994b23]
- Updated dependencies [b763c4d]
- Updated dependencies [b763c4d]
- Updated dependencies [29010c6]
- Updated dependencies [3731650]
  - @membank/mcp@0.11.0
  - @membank/core@0.9.0
  - @membank/dashboard@0.5.1

## 0.9.0

### Minor Changes

- c4f9f4a: Replaced the `needs_review` boolean on memories with a `memory_review_events` table that captures why each memory was flagged — including similarity score, conflicting memory id, and a content snapshot. The `Memory` type now carries `reviewEvents: ReviewEvent[]` instead of `needsReview: boolean`. MCP `query_memory` responses include review event details. A new `membank review` CLI command lists flagged memories with reasons and supports `--resolve <id>` to clear them. The dashboard detail panel shows a collapsible review reasons card.

  **Breaking change:** `Memory.needsReview` removed — use `memory.reviewEvents.length > 0` to check review status.

### Patch Changes

- Updated dependencies [d3df280]
- Updated dependencies [c4f9f4a]
  - @membank/dashboard@0.5.0
  - @membank/core@0.8.0
  - @membank/mcp@0.10.0

## 0.8.0

### Minor Changes

- abb83cd: query_memory now excludes pinned memories by default to avoid duplicating session-injected context; pass `includePinned: true` (MCP) or `--include-pinned` (CLI) to opt in.
- 47e0a49: Setup now installs a UserPromptSubmit injection hook alongside SessionStart, so pinned memories survive context compression and Claude is nudged to call query_memory before exploration tasks.

### Patch Changes

- d88db3a: Replaced ad-hoc CLI input validation with zod schemas; invalid `--type`, `--harness`, `--limit`, `--port`, migrate mode, and import-file shape now produce uniform, descriptive errors instead of silently accepting bad input.
- ee56f9c: Added zod runtime validation at DB and public-API boundaries in core; exported reusable schemas (MemoryTypeSchema, SaveOptionsSchema, QueryOptionsSchema, MemoryRowSchema, etc.) from @membank/core. MCP now uses these shared schemas instead of hand-rolled type checks. CLI MemoryTypeSchema and TagsRowSchema now re-exported from core to eliminate duplication.
- Updated dependencies [abb83cd]
- Updated dependencies [ee56f9c]
  - @membank/core@0.7.0
  - @membank/mcp@0.9.0
  - @membank/dashboard@0.4.1

## 0.7.1

### Patch Changes

- Updated dependencies [c669408]
  - @membank/dashboard@0.4.0

## 0.7.0

### Minor Changes

- 0a3ac28: Removed the `--scope` / `scope` parameter from CLI and MCP in favour of automatic project detection. Added `--global` flag (CLI) and `global` boolean (MCP `save_memory`) to explicitly save a memory with no project association. Added `membank migrate list | run <name>` command and matching MCP `migrate` tool to rename auto-migrated projects to their resolved names.

### Patch Changes

- 11ab2bf: Extracted migration logic and registry into core, eliminating duplication between CLI and MCP. CLI pin/unpin commands now use MemoryRepository.setPin() instead of raw SQL.
- Updated dependencies [0a3ac28]
- Updated dependencies [11ab2bf]
  - @membank/mcp@0.8.0
  - @membank/core@0.6.1
  - @membank/dashboard@0.3.1

## 0.6.0

### Minor Changes

- 19327d6: Added Projects as first-class entities: memories are now associated with named projects (derived from git remote or working directory) instead of raw SHA-256 hashes, and a memory can belong to multiple projects simultaneously or remain global (no associations).

### Patch Changes

- Updated dependencies [8ad1190]
- Updated dependencies [19327d6]
  - @membank/dashboard@0.3.0
  - @membank/core@0.6.0
  - @membank/mcp@0.7.0

## 0.5.1

### Patch Changes

- Updated dependencies [5f48cae]
  - @membank/mcp@0.6.0
  - @membank/core@0.5.1
  - @membank/dashboard@0.2.3

## 0.5.0

### Minor Changes

- f4d498b: Added semantic colors, spinners, table output, and a guided setup wizard with harness multi-select, step indicators, and clack-powered prompts.

### Patch Changes

- d756d76: `setup --dry-run` now shows the config file path and CLI command for each MCP entry, the hook event and command for each injection hook, and the model name, cache path, and cache status instead of generic placeholder messages.
- c7a2ee1: Updated MEMORY_GUIDANCE prompt to winning V2 variant from eval harness, improving save and query trigger clarity.
- 0db5269: Setup command now surfaces the exact CLI command that failed alongside the error message, so users can copy-paste it to debug or report issues.
- aded6f1: remove `@latest` tag from npx command
- Updated dependencies [56ff68f]
- Updated dependencies [aded6f1]
  - @membank/dashboard@0.2.2
  - @membank/mcp@0.5.0
  - @membank/core@0.5.0

## 0.4.1

### Patch Changes

- 017e9b9: Pass `-y` to `npx` in generated MCP server configs and session-start hook commands so installs auto-accept the npx prompt instead of hanging on first run.
  - @membank/core@0.4.1
  - @membank/mcp@0.4.1
  - @membank/dashboard@0.2.1

## 0.4.0

### Minor Changes

- a5aacb0: Removed the `user-prompt` and `tool-failure` injection events — only `SessionStart` is now used. Stale hooks from prior versions are tolerated at runtime (silent no-op) and pruned from settings on the next `membank setup` run. The SessionStart memory guidance prompt was rewritten as a stronger cost-of-omission framing chosen empirically across 18 isolated subagent A/B runs (haiku, 6 variants × 3 reps × 6 scenarios; winner scored 28/30 vs 24/30 for the previous version, with higher save-type accuracy on correction/preference/decision scenarios).

### Patch Changes

- 0bdaf77: Fixed tool-failure injection for Codex (exit_code detection) and copilot-cli (error field mapping).
- a500d4a: Fixed setup command to prompt for each injection hook individually and perform a single write per harness, so the CLI accurately reflects what is written to the vendor config file.
- Updated dependencies [356a873]
  - @membank/dashboard@0.2.0
  - @membank/core@0.4.0
  - @membank/mcp@0.4.0

## 0.3.0

### Minor Changes

- 5b00b4e: Added `membank dashboard` command that opens a browser-based UI for browsing, filtering, editing, pinning, and approving memories stored in SQLite.
- c475120: Added `UserPromptSubmit` and `PostToolUseFailure` hook injection support. Running `membank setup` now registers three hooks per harness: session-start (existing), user-prompt (detects feedback in prompts and reminds Claude to save it), and tool-failure (reminds Claude to save a memory when a tool fails). Supports all four harnesses: claude-code, copilot-cli, codex, and opencode.
- 6751184: Removed stop hook setup from all harnesses (claude-code, copilot-cli, codex, opencode) to prevent infinite tool-call loops triggered by the hook itself.

### Patch Changes

- e2553ec: Fixed Stop hook prompt to suppress output, preventing the hook response from re-triggering the Stop event in a loop.
- Updated dependencies [5b00b4e]
  - @membank/dashboard@0.1.0
  - @membank/core@0.3.0
  - @membank/mcp@0.3.0

## 0.2.0

### Minor Changes

- 09e2f28: Added stop hook to `membank setup`: writes a Claude Code `Stop` prompt hook that asks Claude to reflect on the session and save anything worth remembering to membank via the `save_memory` MCP tool.
- 7ab1872: Added Stop hook support for copilot-cli, codex, and opencode harnesses. Running `membank setup` now writes session-end hooks for all supported harnesses, prompting the LLM to save memories at the end of each session. Also adds `membank stop-hook --harness <name>` command used by those hooks.

### Patch Changes

- @membank/core@0.2.0
- @membank/mcp@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [bf48969]
  - @membank/core@0.1.1
  - @membank/mcp@0.1.1

## 0.1.0

### Minor Changes

- f223548: Added memory guidance to inject output so LLMs know when to query, save, update, delete, and pin memories.

### Patch Changes

- e81f965: `inject` now outputs "[Memory Stats]: no memories saved yet" when the database is empty, instead of producing no output.
  - @membank/core@0.1.0
  - @membank/mcp@0.1.0

## 0.0.4

### Patch Changes

- 9620f8d: Added `inject` CLI command and session-start injection hook registration for Claude Code, Copilot CLI, Codex, and opencode harnesses.
- 3801c10: Renamed `vscode` harness to `copilot`, targeting the GitHub Copilot CLI user config at `~/.copilot/mcp-config.json` instead of the VS Code workspace file.
  - @membank/core@0.0.4
  - @membank/mcp@0.0.4

## 0.0.3

### Patch Changes

- 5c4b222: Fixed setup command to use each vendor's native MCP installation CLI, resolving incorrect config location for claude-code (now uses `claude mcp add --scope user` writing to `~/.claude.json`), wrong config format for codex (now uses `codex mcp add` writing correct TOML), and wrong path and schema for opencode (now writes to `~/.config/opencode/opencode.json` with `type: "local"` and command as an array). Closes https://github.com/draekien-industries/membank/issues/5.
  - @membank/core@0.0.3
  - @membank/mcp@0.0.3

## 0.0.2

### Patch Changes

- 6be8fa8: Fixed `--mcp` flag falling through to Commander help output after `startServer()` resolved.
  - @membank/core@0.0.2
  - @membank/mcp@0.0.2

## 0.0.1

### Patch Changes

- 9a6db9e: Fixed `--mcp` mode exiting immediately after connecting; the server now stays alive to handle MCP requests.
  - @membank/core@0.0.1
  - @membank/mcp@0.0.1

## 0.0.0

### Patch Changes

- 9212575: Fixed bin entry path from `./dist/index.js` to `./dist/index.mjs` so `npx @membank/cli setup` resolves the binary correctly instead of falling back to a system PATH lookup.
  - @membank/core@0.0.0
  - @membank/mcp@0.0.0

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
  - @membank/mcp@0.0.0-dev-20260427133418
