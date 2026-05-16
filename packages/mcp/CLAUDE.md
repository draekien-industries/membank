# @membank/mcp

stdio MCP server. Wraps `@membank/core` use-cases and exposes them to LLMs as MCP tools.

## MCP tools

`query_memory`, `save_memory`, `update_memory`, `delete_memory`, `list_migrations`, `run_migration`, `pin_memory`, `unpin_memory`, `get_memory_summary`, `list_flagged_memories`, `resolve_review`

## Entry points

- `src/server.ts` — MCP server setup and tool registration
- `src/bin.ts` — standalone `membank-mcp` binary (used by harness MCP config)

## Dependency rule

Only imports from `@membank/core` root — never from `@membank/core/.../infrastructure/...`.
