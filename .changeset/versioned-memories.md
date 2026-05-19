---
"@membank/core": minor
"@membank/mcp": minor
"@membank/cli": minor
"@membank/dashboard": minor
---

Added versioned memory history: each content update now archives the previous content (up to 10 versions per memory), enabling history inspection, diffing, and revert via `membank memory history|show|diff|revert` CLI commands and the `list_memory_history` MCP tool.
