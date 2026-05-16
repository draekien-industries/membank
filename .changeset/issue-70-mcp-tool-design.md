---
"@membank/mcp": minor
---

Redesigned MCP tool surface: split `migrate` into `list_migrations` + `run_migration` (schema-level required params), removed redundant `list_memory_types`, replaced `global` boolean with a `scope` enum (`"current"` | `"global"` | `"all"`) across query/save/list/summary tools, added `limit`/`minSimilarity`/`maxSimilarity` filters to `list_flagged_memories`, and corrected `resolve_review` description.
