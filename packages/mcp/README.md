# @membank/mcp

MCP server for membank. Exposes memory tools to LLMs via the [Model Context Protocol](https://modelcontextprotocol.io).

## Overview

Runs as a stdio MCP server. LLM harnesses (Claude Code, GitHub Copilot, etc.) connect to it and can call five tools to query, save, update, and delete memories.

In most cases you don't need to use this package directly — `@membank/cli` starts the server via the `--mcp` flag and `membank setup` writes the harness config automatically.

## Usage

### Start the server

```typescript
import { startServer } from '@membank/mcp'

await startServer()
```

Or via the CLI:

```bash
npx @membank/cli --mcp
```

### MCP config (manual)

If you're configuring a harness by hand, point it at:

```json
{
  "command": "npx",
  "args": ["@membank/cli", "--mcp"]
}
```

## Tools

### `query_memory`

Semantic search over stored memories.

```
query   string   required   Natural language search query
type    enum     optional   Filter by memory type
scope   string   optional   Filter by project scope
limit   number   optional   Max results (default: 10)
```

Returns an array of memories with scores.

### `save_memory`

Store a new memory. Deduplication runs automatically.

```
content   string   required   Memory content
type      enum     required   correction | preference | decision | learning | fact
tags      array    optional   String tags for grouping
scope     string   optional   Project scope (auto-resolved if omitted)
```

Returns the saved Memory object.

### `update_memory`

Update the content or tags of an existing memory.

```
id        string   required   Memory ID
content   string   required   New content
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
