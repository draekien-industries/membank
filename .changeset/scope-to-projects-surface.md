---
"@membank/cli": minor
"@membank/mcp": minor
"@membank/core": patch
---

Removed the `--scope` / `scope` parameter from CLI and MCP in favour of automatic project detection. Added `--global` flag (CLI) and `global` boolean (MCP `save_memory`) to explicitly save a memory with no project association. Added `membank migrate list | run <name>` command and matching MCP `migrate` tool to rename auto-migrated projects to their resolved names.
