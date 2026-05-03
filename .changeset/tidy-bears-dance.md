---
"@membank/core": patch
"@membank/cli": patch
"@membank/mcp": patch
---

Extracted migration logic and registry into core, eliminating duplication between CLI and MCP. CLI pin/unpin commands now use MemoryRepository.setPin() instead of raw SQL.
