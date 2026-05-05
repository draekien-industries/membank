---
"@membank/core": minor
"@membank/mcp": minor
"@membank/cli": minor
---

query_memory now excludes pinned memories by default to avoid duplicating session-injected context; pass `includePinned: true` (MCP) or `--include-pinned` (CLI) to opt in.
