# @membank/cli

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
