---
"@membank/core": minor
"@membank/mcp": minor
"@membank/cli": minor
"@membank/dashboard": minor
---

Memories created inside a git worktree now resolve to the parent repository's project instead of a separate orphan, and existing orphaned worktree projects can be reconciled into their parent via the CLI, MCP, and dashboard (with the dashboard also able to delete an orphaned project and its exclusive memories).
