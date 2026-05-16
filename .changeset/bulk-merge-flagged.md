---
"@membank/mcp": minor
"@membank/core": minor
---

Added bulk maintenance tools (delete_many, resolve_many) and a merge_memories tool, inlined the current conflicting memory and cluster groupings into list_flagged_memories, and broke get_memory_summary's review queue down by similarity band, type, and cluster count — so AI agents can clean up flagged memories in a fraction of the calls.
