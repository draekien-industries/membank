---
"@membank/core": minor
"@membank/mcp": minor
"@membank/cli": minor
"@membank/dashboard": minor
---

Added capability memory: memories can now be attached to a tool or skill (e.g. `tool:Bash`, `skill:shadcn`) independent of any project, so transferable learnings are shared across projects instead of polluting global. Save and query them via the `tool:<name>`/`skill:<name>` scope, browse them in the dashboard's Capabilities view, and have a capability's memories injected automatically before that tool or skill is used (claude-code PreToolUse hook — re-run `membank setup` to register it).
