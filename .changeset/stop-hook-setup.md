---
"@membank/cli": minor
---

Added stop hook to `membank setup`: writes a Claude Code `Stop` prompt hook that asks Claude to reflect on the session and save anything worth remembering to membank via the `save_memory` MCP tool.
