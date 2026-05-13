# @membank/mcp

MCP server for membank. Exposes memory tools to LLMs via the [Model Context Protocol](https://modelcontextprotocol.io).

## Overview

Runs as a stdio MCP server. LLM harnesses (Claude Code, GitHub Copilot, etc.) connect to it and can call tools to query, save, update, delete, pin, and migrate memories.

Run `membank setup` to auto-configure your harness — it writes the correct command for you.

## Usage

### Standalone binary (recommended)

```bash
npx @membank/mcp
```

Starts the stdio MCP server directly, without pulling in the full CLI package. This is what `membank setup` writes into harness configs.

### Programmatic

```typescript
import { startServer } from '@membank/mcp'

await startServer()
```

### MCP config (manual)

If you're configuring a harness by hand, point it at:

```json
{
  "command": "npx",
  "args": ["-y", "@membank/mcp"]
}
```

> **Legacy:** `npx @membank/cli --mcp` still works but emits a deprecation warning. Run `membank setup upgrade` to migrate existing configs.

## Tools

### `query_memory`

Semantic search over stored memories.

```
query           string    required   Natural language search query
type            enum      optional   Filter by memory type
limit           number    optional   Max results (default: 10)
includePinned   boolean   optional   Include pinned memories in results (excluded by default to avoid duplicates)
global          boolean   optional   Query global memories only; omit or false to query current project scope
```

Returns an array of memories with scores.

### `save_memory`

Store a new memory. Deduplication runs automatically.

```
content   string    required   Memory content
type      enum      required   correction | preference | decision | learning | fact
tags      array     optional   String tags for grouping
global    boolean   optional   Save as a global memory, not tied to any project
```

Returns the saved Memory object.

### `update_memory`

Update the content, type, and/or tags of an existing memory.

```
id        string   required   Memory ID
content   string   optional   New content
type      enum     optional   New type (reclassification)
tags      array    optional   Replacement tags
```

Returns the updated Memory object.

### `delete_memory`

Remove a memory permanently.

```
id   string   required   Memory ID to delete
```

Returns `{ success: true, id }`.

### `list_memory_types`

Returns the ordered list of valid memory type values. No input required.

### `pin_memory`

Pin a memory so it is always injected into session context.

```
id   string   required   Memory ID to pin
```

### `unpin_memory`

Remove a memory from guaranteed session injection.

```
id   string   required   Memory ID to unpin
```

### `get_memory_summary`

Returns aggregate stats: total memories, counts by type, pinned count, and review queue size. No input required.

### `list_flagged_memories`

List memories with unresolved dedup review events (similarity 0.75–0.92). No input required.

### `resolve_review`

Dismiss all open review events for a memory after reviewing it.

```
id   string   required   Memory ID to resolve review events for
```

Returns `{ success: true, id }`.

### `migrate`

List or run named data migrations.

```
mode   enum     required   "list" to see available migrations, "run" to execute one
name   string   optional   Migration name (required when mode is "run")
```

## Architecture

```
LLM Harness (Claude Code, Copilot, etc.)
        │  stdio
        ▼
  @membank/mcp  ←→  @membank/core  ←→  ~/.membank/memory.db
```

The MCP server is thin — it validates inputs, delegates all logic to `@membank/core`, and serializes results.

## Requirements

- Node.js >=24
