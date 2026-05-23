---
"@membank/core": minor
"@membank/mcp": patch
---

Added `primaryScopeHash` to the `Memory` type so callers no longer need to navigate `memory.projects[0]?.scopeHash` to get the effective scope hash.
