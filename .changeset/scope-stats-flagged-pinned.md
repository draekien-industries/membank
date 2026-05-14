---
"@membank/core": patch
"@membank/mcp": patch
---

Scoped stats(), listFlagged(), and getPinnedCharCount() to the current project so session-start stats, get_memory_summary, list_flagged_memories, and the pin budget check no longer report inflated global counts when operating within a project context.
