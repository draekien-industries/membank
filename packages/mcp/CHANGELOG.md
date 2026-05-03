# @membank/mcp

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
